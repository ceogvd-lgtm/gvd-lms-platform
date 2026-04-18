'use client';

import { Button, Card, CardContent, Progress, cn } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, CheckCircle2, Database, Sparkles, XCircle } from 'lucide-react';

import { aiApi } from '@/lib/ai';
import { useAuthStore } from '@/lib/auth-store';

const DAILY_DISPLAY_CAP = 1500;

/**
 * Admin-only "AI & Quota" panel rendered as a tab inside
 * /admin/settings. Surfaces three things operators care about:
 *   1. Is Gemini configured (key present)? Which model ids?
 *   2. Today's per-bucket request counter + warning band.
 *   3. ChromaDB heartbeat + indexed-doc count.
 */
export function AiHealthPanel() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const query = useQuery({
    queryKey: ['ai-health'],
    queryFn: () => aiApi.getHealth(accessToken!),
    enabled: !!accessToken,
    refetchInterval: 30_000,
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-slate-500">
          <Activity className="h-4 w-4 animate-pulse" /> Đang tải trạng thái AI...
        </CardContent>
      </Card>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Card className="border-error/30 bg-error/5">
        <CardContent className="flex items-center gap-2 p-4 text-sm text-error">
          <AlertCircle className="h-4 w-4" /> Không tải được trạng thái AI.
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { gemini, quotaToday, chroma } = query.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#7C3AED]" />
            <h3 className="text-sm font-semibold">Gemini</h3>
            {gemini.configured ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                <CheckCircle2 className="h-3 w-3" /> đã cấu hình
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-xs text-error">
                <XCircle className="h-3 w-3" /> chưa có GEMINI_API_KEY
              </span>
            )}
          </div>
          {gemini.models && (
            <dl className="grid gap-2 text-xs text-slate-600 dark:text-slate-400 sm:grid-cols-3">
              <div>
                <dt className="font-medium uppercase tracking-wide text-slate-400">Chat</dt>
                <dd className="font-mono text-slate-800 dark:text-slate-200">
                  {gemini.models.chat}
                </dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wide text-slate-400">Lite</dt>
                <dd className="font-mono text-slate-800 dark:text-slate-200">
                  {gemini.models.lite}
                </dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wide text-slate-400">Embedding</dt>
                <dd className="font-mono text-slate-800 dark:text-slate-200">
                  {gemini.models.embedding}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Quota hôm nay</h3>
          </div>
          <div className="space-y-3">
            {quotaToday.map((q) => {
              const pct = Math.min(100, Math.round((q.requests / DAILY_DISPLAY_CAP) * 100));
              const over = q.requests > 1400;
              return (
                <div key={q.model} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {q.model}
                    </span>
                    <span
                      className={cn(
                        'font-mono',
                        over ? 'text-error' : 'text-slate-700 dark:text-slate-200',
                      )}
                    >
                      {q.requests} / {DAILY_DISPLAY_CAP}
                    </span>
                  </div>
                  <Progress value={pct} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">ChromaDB</h3>
            {chroma.connected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                <CheckCircle2 className="h-3 w-3" /> connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-xs text-error">
                <XCircle className="h-3 w-3" /> offline
              </span>
            )}
          </div>
          <dl className="grid gap-2 text-xs text-slate-600 dark:text-slate-400 sm:grid-cols-2">
            <div>
              <dt className="font-medium uppercase tracking-wide text-slate-400">Collection</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">{chroma.collection}</dd>
            </div>
            <div>
              <dt className="font-medium uppercase tracking-wide text-slate-400">Indexed chunks</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">
                {chroma.indexedDocuments}
              </dd>
            </div>
            {!chroma.connected && chroma.error && (
              <div className="sm:col-span-2">
                <dt className="font-medium uppercase tracking-wide text-slate-400">Error</dt>
                <dd className="break-words text-[11px] text-error">{chroma.error}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
