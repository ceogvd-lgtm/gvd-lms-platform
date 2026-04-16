/**
 * XMLHttpRequest-based upload helper — `fetch()` can't report upload progress
 * in the browser (no `ProgressEvent` on request body streams pre-Streams API),
 * so we fall back to XHR for the upload path only.
 *
 * Features:
 *   - Realtime progress via the `progress` event
 *   - Cancellable via `AbortSignal`
 *   - Automatic retry with exponential backoff (default 3 attempts)
 *   - JSON response parsing + error envelope awareness
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export interface UploadOptions {
  /** Path relative to NEXT_PUBLIC_API_URL, e.g. "/upload/avatar". */
  path: string;
  file: File;
  /** JWT bearer — auth store caller responsibility. */
  token: string;
  /** Additional multipart fields — e.g. { contentType: 'WEBGL', lessonId: '…' }. */
  extraFields?: Record<string, string>;
  /** 0..1 progress callback, called many times during upload. */
  onProgress?: (ratio: number) => void;
  /** Abort via AbortController.signal. */
  signal?: AbortSignal;
  /** Retry count (default 3). Each retry doubles the backoff delay. */
  retries?: number;
}

export interface UploadError extends Error {
  status?: number;
  body?: unknown;
}

export interface UploadResult {
  fileUrl: string;
  fileKey: string;
  fileSize: number;
  mimeType: string;
  extractionJobId?: string;
}

/**
 * Single-attempt upload. Prefer `uploadWithRetry` for user-facing flows.
 */
export function uploadOnce(opts: UploadOptions): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${opts.path}`, true);
    xhr.setRequestHeader('Authorization', `Bearer ${opts.token}`);
    xhr.responseType = 'text';

    // --- progress ---
    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          opts.onProgress!(Math.min(1, e.loaded / e.total));
        }
      };
    }

    // --- abort ---
    const onAbort = () => xhr.abort();
    if (opts.signal) {
      if (opts.signal.aborted) {
        reject(domException('The upload was aborted'));
        return;
      }
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.onload = () => {
      opts.signal?.removeEventListener('abort', onAbort);
      const body = safeJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as UploadResult);
      } else {
        const msg =
          (body && typeof body === 'object' && 'message' in body
            ? String((body as { message: unknown }).message)
            : null) ?? `Upload failed (${xhr.status})`;
        const err: UploadError = new Error(msg);
        err.status = xhr.status;
        err.body = body;
        reject(err);
      }
    };

    xhr.onerror = () => {
      opts.signal?.removeEventListener('abort', onAbort);
      reject(Object.assign(new Error('Network error'), { status: 0 }));
    };

    xhr.onabort = () => {
      opts.signal?.removeEventListener('abort', onAbort);
      reject(domException('The upload was aborted'));
    };

    const form = new FormData();
    form.append('file', opts.file);
    if (opts.extraFields) {
      for (const [k, v] of Object.entries(opts.extraFields)) {
        form.append(k, v);
      }
    }
    xhr.send(form);
  });
}

/**
 * Upload with automatic retry on transient failures. Does NOT retry:
 *   - 4xx client errors (file too large, bad MIME, 401/403)
 *   - User abort
 * Retries on network errors + 5xx, with exponential backoff (500ms, 1s, 2s).
 */
export async function uploadWithRetry(opts: UploadOptions): Promise<UploadResult> {
  const retries = opts.retries ?? 3;
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < retries) {
    try {
      return await uploadOnce(opts);
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      const status = (err as UploadError).status ?? 0;
      const isClientError = status >= 400 && status < 500;
      if (isClientError) throw err; // don't retry — file/user error
      lastErr = err;
      attempt += 1;
      if (attempt < retries) {
        const delay = 500 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ---------- Storage API surface ----------

export const storageApi = {
  /** Delete an object by key — ADMIN+ only on the backend. */
  deleteObject: async (key: string, token: string): Promise<void> => {
    const res = await fetch(
      `${API_URL}/storage/object/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) throw new Error(`Delete failed (${res.status})`);
  },

  /** Request a presigned GET URL for a private object. */
  getPresignedUrl: async (key: string, token: string, ttl = 3600): Promise<string> => {
    const qs = new URLSearchParams({ key, ttl: String(ttl) });
    const res = await fetch(`${API_URL}/storage/presigned?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Presign failed (${res.status})`);
    const data = (await res.json()) as { url: string };
    return data.url;
  },
};

// ---------- helpers ----------

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function domException(msg: string): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(msg, 'AbortError');
  }
  return Object.assign(new Error(msg), { name: 'AbortError' });
}

/**
 * TODO (Phase 07): chunked / multipart direct-to-MinIO upload for files > 100 MB.
 * - client: split into 5 MB chunks
 * - backend: issue presigned-url-per-part (requires StorageService.presignedPut)
 * - client: PUT each chunk directly to MinIO, track progress across chunks
 * - backend: complete-multipart endpoint
 * Currently any file under the route's size cap goes through memory-buffered
 * multer on the backend, which practically limits content uploads to ~100 MB.
 */
export const chunkedUpload = null as unknown as (opts: UploadOptions) => Promise<UploadResult>;
