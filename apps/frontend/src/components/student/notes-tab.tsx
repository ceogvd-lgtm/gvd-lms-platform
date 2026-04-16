'use client';

import { Button } from '@lms/ui';
import { Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { RichTextEditor, type JSONContent } from '@/components/instructor/rich-text-editor';

interface NotesTabProps {
  lessonId: string;
  studentId: string;
}

const AUTO_SAVE_INTERVAL = 30_000;

/**
 * Personal notes — rich text saved to `localStorage` per
 * (studentId, lessonId). We reuse the Phase-10 TipTap editor so students
 * get the same toolbar instructors do.
 *
 * localStorage key: `note-{lessonId}-{studentId}` — the spec's exact
 * shape so future phases (e.g. sync to server on logout) can find
 * existing notes.
 */
export function NotesTab({ lessonId, studentId }: NotesTabProps) {
  const storageKey = `note-${lessonId}-${studentId}`;
  const [content, setContent] = useState<JSONContent | null>(null);
  const [loaded, setLoaded] = useState(false);
  const dirtyRef = useRef(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        setContent(JSON.parse(raw) as JSONContent);
      }
    } catch {
      // ignore — just start fresh
    } finally {
      setLoaded(true);
    }
  }, [storageKey]);

  // Auto-save every 30 s.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!dirtyRef.current || !content) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(content));
        dirtyRef.current = false;
      } catch {
        // storage full / private mode — silently drop.
      }
    }, AUTO_SAVE_INTERVAL);
    return () => window.clearInterval(t);
  }, [content, storageKey]);

  function handleChange(next: JSONContent) {
    setContent(next);
    dirtyRef.current = true;
  }

  function saveNow() {
    if (!content) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(content));
      dirtyRef.current = false;
      toast.success('Đã lưu ghi chú');
    } catch {
      toast.error('Không lưu được ghi chú (localStorage đầy?)');
    }
  }

  if (!loaded) {
    return <div className="h-64 animate-pulse rounded-card bg-surface-2" />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Ghi chú của bạn lưu cục bộ trên trình duyệt này. Auto-save mỗi 30 giây.
      </p>
      <RichTextEditor
        initialContent={content}
        onChange={handleChange}
        placeholder="Ghi chú cá nhân cho bài học này…"
        minHeight={320}
      />
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={saveNow}>
          <Save className="h-4 w-4" />
          Lưu ngay
        </Button>
      </div>
    </div>
  );
}
