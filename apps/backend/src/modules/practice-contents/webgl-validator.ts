import unzipper from 'unzipper';

/**
 * Structure summary used by both the sync pre-flight validator and the
 * async extractor — we keep them in one place so "what a valid Unity
 * WebGL zip looks like" isn't defined in two services.
 */
export interface WebGLZipSummary {
  /** Every path inside the zip (relative, forward-slash). */
  files: string[];
  hasIndexHtml: boolean;
  hasLoader: boolean;
  hasFramework: boolean;
  hasData: boolean;
  hasWasm: boolean;
  /** Detected Unity project name from `<name>.loader.js`. */
  projectName: string | null;
}

/**
 * Peek at a Unity WebGL build zip WITHOUT writing anything to disk. We
 * use this at upload time to fail fast with a 400 so the instructor
 * doesn't wait for the BullMQ worker before seeing "thiếu Builds.loader.js".
 *
 * Accepts both:
 *   - flat zips (index.html at root)
 *   - wrapper-folder zips (Unity's default export) where all files live
 *     under a single top-level directory like `Builds/`
 */
export async function summariseWebGLZip(buffer: Buffer): Promise<WebGLZipSummary> {
  const directory = await unzipper.Open.buffer(buffer);
  const files = directory.files
    .filter((f) => f.type === 'File')
    .map((f) => f.path.replace(/\\/g, '/'));

  // Drop OS-generated junk BEFORE detecting the common prefix. A Mac-zipped
  // build ships with `__MACOSX/` + `.DS_Store` + `._*` AppleDouble files;
  // Windows zips sometimes carry `Thumbs.db` / `desktop.ini`. If we leave
  // these in, `stripCommonPrefix` sees two top-level folders (`WebGL/` and
  // `__MACOSX/`), concludes "no shared prefix", and returns paths with the
  // wrapper folder intact — which then places the uploaded files at
  // `content/webgl/{lessonId}/WebGL/index.html` instead of the predicted
  // `content/webgl/{lessonId}/index.html`, so the student iframe 404s.
  const cleaned = filterJunkPaths(files);

  // Strip any single common top-level directory so `Builds/index.html` and
  // `index.html` both look like "index.html" for matching.
  const flat = stripCommonPrefix(cleaned);

  const hasIndexHtml = flat.some((p) => p === 'index.html' || p.endsWith('/index.html'));

  // Unity's web build emits `<ProjectName>.loader.js` — match ANY loader file
  // so builds from projects other than "Builds" still work. We do expose the
  // detected project name so the UI can display something helpful.
  const loaderMatch = flat
    .map((p) => /([^/]+)\.loader\.js$/i.exec(p))
    .find((m): m is RegExpExecArray => !!m);
  const projectName = loaderMatch?.[1] ?? null;

  const hasLoader = !!projectName;
  const hasFramework = projectName
    ? flat.some(
        (p) =>
          p.endsWith(`${projectName}.framework.js`) ||
          p.endsWith(`${projectName}.framework.js.gz`) ||
          p.endsWith(`${projectName}.framework.js.br`),
      )
    : false;
  const hasData = projectName
    ? flat.some(
        (p) =>
          p.endsWith(`${projectName}.data`) ||
          p.endsWith(`${projectName}.data.gz`) ||
          p.endsWith(`${projectName}.data.br`),
      )
    : false;
  const hasWasm = projectName
    ? flat.some(
        (p) =>
          p.endsWith(`${projectName}.wasm`) ||
          p.endsWith(`${projectName}.wasm.gz`) ||
          p.endsWith(`${projectName}.wasm.br`),
      )
    : false;

  return {
    files: flat,
    hasIndexHtml,
    hasLoader,
    hasFramework,
    hasData,
    hasWasm,
    projectName,
  };
}

/**
 * Raise a user-facing error message in Vietnamese pinpointing exactly
 * what's missing. Returns `null` when the zip is structurally valid.
 */
export function validateWebGLSummary(summary: WebGLZipSummary): string | null {
  if (summary.files.length === 0) return 'File zip rỗng';
  if (!summary.hasIndexHtml) return 'WebGL build không hợp lệ: thiếu index.html';
  if (!summary.hasLoader) return 'WebGL build không hợp lệ: thiếu Builds.loader.js';
  // .framework.js / .data / .wasm are strongly expected but some project
  // configurations split them differently — warn through the projectName
  // detection but don't hard-fail the upload.
  return null;
}

/**
 * Drop OS-generated junk from a path list.
 *
 * Exported so the BullMQ extractor can apply the SAME filter the validator
 * uses — otherwise the extractor would upload `__MACOSX/...` to MinIO and
 * `stripCommonPrefix` would see a mixed top-level layout. Matching rules:
 *   - `__MACOSX/**`           macOS resource forks from Archive Utility
 *   - basename `.DS_Store`    Finder folder metadata
 *   - basename starting `._`  AppleDouble sidecar files (Mac-on-non-HFS)
 *   - basename `Thumbs.db` / `desktop.ini`  Windows Explorer metadata
 *
 * Case-insensitive to match Windows/macOS filesystem semantics.
 */
export function filterJunkPaths(paths: string[]): string[] {
  return paths.filter((p) => {
    if (p.startsWith('__MACOSX/')) return false;
    const basename = p.slice(p.lastIndexOf('/') + 1);
    if (basename === '.DS_Store') return false;
    if (basename.startsWith('._')) return false;
    const lower = basename.toLowerCase();
    if (lower === 'thumbs.db' || lower === 'desktop.ini') return false;
    return true;
  });
}

/**
 * If every file shares a single top-level directory (e.g. Unity exports
 * `Builds/…`), strip that prefix so downstream matches look clean.
 * A zip with mixed top-levels is returned unchanged.
 *
 * Exported so the BullMQ extractor can apply the SAME normalisation the
 * validator used — keeping validator + extractor in agreement on what
 * "at the root" means.
 */
export function stripCommonPrefix(paths: string[]): string[] {
  if (paths.length === 0) return paths;
  const first = paths[0]!.split('/')[0];
  if (!first) return paths;
  // Every path must start with `first/` and `first/` must actually be a
  // directory (i.e. every path has at least one slash after it).
  const allShare = paths.every((p) => p === first || p.startsWith(`${first}/`));
  if (!allShare) return paths;
  return paths
    .map((p) => (p === first ? '' : p.slice(first.length + 1)))
    .filter((p) => p.length > 0);
}
