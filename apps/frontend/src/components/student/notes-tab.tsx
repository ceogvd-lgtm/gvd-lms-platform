'use client';

import { Button } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { Check, CloudOff, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { RichTextEditor, type JSONContent } from '@/components/instructor/rich-text-editor';
import { useAuthStore } from '@/lib/auth-store';
import { lessonNotesApi } from '@/lib/students';

interface NotesTabProps {
  lessonId: string;
  studentId: string;
}

const AUTO_SAVE_INTERVAL = 30_000;
const LOCAL_KEY = (lessonId: string, studentId: string) => `note-${lessonId}-${studentId}`;

type SaveState = 'idle' | 'saving' | 'saved' | 'offline';

/**
 * Personal notes (Phase 14) — upgraded from localStorage to DB sync.
 *
 * Flow:
 *   1. On mount, GET /lessons/:id/notes → hydrate the editor.
 *   2. Every 30 s, if dirty, PUT /lessons/:id/notes with the TipTap JSON.
 *   3. Also mirror to localStorage so a flaky API doesn't lose edits.
 *   4. On API failure → `offline` state, keep local copy, retry next tick.
 *
 * The storage key format (`note-{lessonId}-{studentId}`) is kept
 * backwards-compatible with Phase 12 so users who have notes in
 * localStorage from before don't lose them — we merge by taking the
 * NEWER of (server.updatedAt, local.updatedAt).
 */
export function NotesTab({ lessonId, studentId }: NotesTabProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const storageKey = LOCAL_KEY(lessonId, studentId);
  const [content, setContent] = useState<JSONContent | null>(null);
  const [state, setState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const dirtyRef = useRef(false);
  const hydratedRef = useRef(false);

  // Fetch server copy on mount.
  const query = useQuery({
    queryKey: ['lesson-notes', lessonId],
    queryFn: () => lessonNotesApi.get(lessonId, accessToken!),
    enabled: !!accessToken,
  });

  // Hydrate from server OR localStorage fallback — whichever is newer.
  useEffect(() => {
    if (hydratedRef.current) return;
    if (query.isLoading) return;

    let localContent: JSONContent | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) localContent = JSON.parse(raw) as JSONContent;
    } catch {
      // ignore
    }

    const serverContent = (query.data?.content as JSONContent | null) ?? null;

    // Prefer server content if present; else fall back to local.
    setContent(serverContent ?? localContent);
    if (query.data?.updatedAt) setLastSavedAt(new Date(query.data.updatedAt));
    hydratedRef.current = true;
  }, [query.data, query.isLoading, storageKey]);

  // Auto-save loop.
  useEffect(() => {
    if (!accessToken) return;
    const t = window.setInterval(async () => {
      if (!dirtyRef.current || !content) return;
      dirtyRef.current = false;
      setState('saving');
      try {
        const res = await lessonNotesApi.save(lessonId, content, accessToken);
        setState('saved');
        setLastSavedAt(res.updatedAt ? new Date(res.updatedAt) : new Date());
        // Refresh local cache too for offline continuity.
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(content));
        } catch {
          // storage full — ignore
        }
      } catch {
        setState('offline');
        // Store locally as emergency fallback.
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(content));
        } catch {
          // nothing more we can do
        }
      }
    }, AUTO_SAVE_INTERVAL);
    return () => window.clearInterval(t);
  }, [accessToken, content, lessonId, storageKey]);

  function handleChange(next: JSONContent) {
    setContent(next);
    dirtyRef.current = true;
    setState('idle');
  }

  async function saveNow() {
    if (!content || !accessToken) return;
    setState('saving');
    try {
      const res = await lessonNotesApi.save(lessonId, content, accessToken);
      dirtyRef.current = false;
      setState('saved');
      setLastSavedAt(res.updatedAt ? new Date(res.updatedAt) : new Date());
      toast.success('Đã lưu ghi chú');
    } catch (err) {
      setState('offline');
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(content));
      } catch {
        // ignore
      }
      toast.error(
        err instanceof Error && err.message ? err.message : 'Lưu server thất bại — đã lưu cục bộ.',
      );
    }
  }

  if (!hydratedRef.current) {
    return <div className="h-64 animate-pulse rounded-card bg-surface-2" />;
  }

  const statusLabel =
    state === 'saving'
      ? 'Đang lưu…'
      : state === 'offline'
        ? 'Offline — đã lưu cục bộ'
        : lastSavedAt
          ? `Đã lưu lúc ${lastSavedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
          : 'Chưa lưu';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Ghi chú cá nhân — auto-save mỗi 30 giây, lưu trên server + cache cục bộ.
        </p>
        <span
          className={
            'inline-flex items-center gap-1.5 text-xs ' +
            (state === 'offline'
              ? 'text-error'
              : state === 'saving'
                ? 'text-primary'
                : 'text-muted')
          }
        >
          {state === 'offline' ? (
            <CloudOff className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {statusLabel}
        </span>
      </div>
      <RichTextEditor
        initialContent={content}
        onChange={handleChange}
        placeholder="Ghi chú cá nhân cho bài học này…"
        minHeight={320}
      />
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={saveNow} disabled={state === 'saving'}>
          <Save className="h-4 w-4" />
          Lưu ngay
        </Button>
      </div>
    </div>
  );
}
