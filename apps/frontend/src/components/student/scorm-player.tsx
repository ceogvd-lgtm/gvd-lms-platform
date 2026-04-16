'use client';

import { cn } from '@lms/ui';
import { Loader2 } from 'lucide-react';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@/lib/auth-store';
import { scormApi, type ScormManifestResponse, type ScormTrackPayload } from '@/lib/theory-engine';

interface ScormPlayerProps {
  lessonId: string;
  /** Pre-fetched manifest — lets the parent skeleton while waiting. */
  manifest: ScormManifestResponse;
  onComplete?: () => void;
}

declare global {
  interface Window {
    Scorm12API?: new (settings?: Record<string, unknown>) => Scorm12Api;
    Scorm2004API?: new (settings?: Record<string, unknown>) => Scorm2004Api;
    // The bridge exposes these globally so the SCO iframe can find them.
    API?: Scorm12Api;
    API_1484_11?: Scorm2004Api;
  }
}

interface Scorm12Api {
  on: (event: string, cb: (CMIElement?: string, value?: unknown) => void) => void;
  cmi: Record<string, unknown>;
}

interface Scorm2004Api extends Scorm12Api {}

/**
 * SCORM / xAPI player — loads the package's entry HTML inside an iframe
 * and bridges runtime calls (LMSCommit, LMSSetValue, LMSFinish) to the
 * Phase-12 `/scorm/:lessonId/track` endpoint via scorm-again.
 *
 * Bridging strategy:
 *   1. scorm-again.min.js is served statically from /scorm-again.min.js
 *      and loaded via next/script in `afterInteractive` mode (we need it
 *      on window before the iframe mounts).
 *   2. On mount, we instantiate the right class (Scorm12API for version
 *      "1.2", Scorm2004API otherwise) and register listeners on the
 *      "CommitSuccess" and "LMSFinish" events.
 *   3. When either fires, we push a TrackScormDto to the backend with
 *      the current cmi fields. The backend does the progress math.
 *
 * The iframe is sandboxed minimally (`allow-same-origin allow-scripts
 * allow-forms`) so legacy SCORM 1.2 packages that POST to fake URLs
 * don't try to navigate the parent.
 */
export function ScormPlayer({ lessonId, manifest, onComplete }: ScormPlayerProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const completedRef = useRef(false);
  const apiRef = useRef<Scorm12Api | null>(null);

  // =====================================================
  // Initialise the scorm-again API as soon as the library is on window.
  // =====================================================
  useEffect(() => {
    if (!ready) return;
    if (!window.Scorm12API && !window.Scorm2004API) return;

    // scorm-again exposes different class names depending on version;
    // both export `on()` so the downstream code is identical.
    let api: Scorm12Api | null = null;
    if (manifest.version === '1.2' && window.Scorm12API) {
      api = new window.Scorm12API({ autocommit: true, logLevel: 4 });
      window.API = api;
    } else if (window.Scorm2004API) {
      api = new window.Scorm2004API({ autocommit: true, logLevel: 4 });
      window.API_1484_11 = api;
    }
    if (!api) return;
    apiRef.current = api;

    const push = async (extra: ScormTrackPayload = {}) => {
      if (!accessToken) return;
      try {
        const cmi = api!.cmi as Record<string, unknown>;
        // SCORM 1.2 vs 2004 have different CMI element paths; read both.
        const lessonStatus =
          (cmi['core.lesson_status'] as string | undefined) ??
          (cmi['completion_status'] as string | undefined) ??
          (cmi['success_status'] as string | undefined);
        const scoreRawRaw =
          (cmi['core.score.raw'] as number | string | undefined) ??
          (cmi['score.raw'] as number | string | undefined);
        const scoreRaw = scoreRawRaw == null ? undefined : Number(scoreRawRaw);

        const sessionTimeStr =
          (cmi['core.session_time'] as string | undefined) ??
          (cmi['session_time'] as string | undefined);
        const sessionTime = sessionTimeStr ? parseIsoDuration(sessionTimeStr) : undefined;

        const res = await scormApi.track(
          lessonId,
          {
            lessonStatus: lessonStatus as ScormTrackPayload['lessonStatus'],
            scoreRaw: Number.isFinite(scoreRaw) ? (scoreRaw as number) : undefined,
            sessionTime,
            ...extra,
          },
          accessToken,
        );
        if (res.status === 'COMPLETED' && !completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
      } catch {
        // Non-fatal — keep playing even if the track call blips.
      }
    };

    api.on('CommitSuccess', () => void push());
    api.on('LMSCommit', () => void push());
    api.on('LMSFinish', () => void push({ lessonStatus: 'completed' }));
    api.on('SequenceExit', () => void push());

    return () => {
      // Nothing to clean — window.API references live for the SCO's life.
    };
  }, [ready, manifest.version, accessToken, lessonId, onComplete]);

  return (
    <div className="flex flex-col gap-3">
      <Script
        src="/scorm-again.min.js"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <div
        className={cn(
          'relative overflow-hidden rounded-card border border-border bg-surface',
          'min-h-[600px]',
        )}
      >
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-2/50">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted">
                Đang tải gói {manifest.version === '1.2' ? 'SCORM 1.2' : 'SCORM 2004'}…
              </p>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={manifest.entryUrl}
          title={manifest.title}
          onLoad={() => setIframeLoaded(true)}
          className="block h-[700px] w-full border-0"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          allow="autoplay; fullscreen; accelerometer; gyroscope"
        />
      </div>
    </div>
  );
}

/**
 * Parse an ISO-8601 duration ("PT1H30M15S") or SCORM-1.2 HH:MM:SS.ss
 * into a seconds number. Best-effort — unknown formats return 0.
 */
export function parseIsoDuration(raw: string): number {
  if (!raw) return 0;
  const colon = raw.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (colon) {
    return Number(colon[1]) * 3600 + Number(colon[2]) * 60 + Math.floor(Number(colon[3]));
  }
  const iso = raw.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (iso) {
    const [, d, h, m, s] = iso;
    return (
      (d ? Number(d) * 86400 : 0) +
      (h ? Number(h) * 3600 : 0) +
      (m ? Number(m) * 60 : 0) +
      (s ? Math.floor(Number(s)) : 0)
    );
  }
  return 0;
}
