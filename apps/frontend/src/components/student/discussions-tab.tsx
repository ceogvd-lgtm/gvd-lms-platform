'use client';

import { Avatar, Badge, Button, Card, CardContent } from '@lms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { MentionComposer, type MentionComposerHandle } from './mention-composer';

import { useAuthStore } from '@/lib/auth-store';
import { connectNotificationsSocket, type AppNotification } from '@/lib/notifications';
import { discussionsApi, type DiscussionThread } from '@/lib/students';


interface DiscussionsTabProps {
  lessonId: string;
}

/**
 * Q&A tab (Phase 14 new) — threaded discussions per lesson.
 *
 * Layout:
 *   New-thread composer (top) → list of threads sorted newest-first.
 *   Each thread: author row + content + inline reply composer + replies
 *   indented with smaller avatars. Owners (+ ADMIN+) see a Delete icon.
 *
 * Notifications are server-side: POST /lessons/:id/discussions creates
 * a DISCUSSION_MENTION for the course instructor when a STUDENT asks,
 * POST /discussions/:id/replies notifies thread author + prior repliers.
 */
export function DiscussionsTab({ lessonId }: DiscussionsTabProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const composerRef = useRef<MentionComposerHandle>(null);

  const query = useQuery({
    queryKey: ['discussions', lessonId],
    queryFn: () => discussionsApi.list(lessonId, accessToken!),
    enabled: !!accessToken,
    refetchOnWindowFocus: true,
  });

  // Phase 14 gap #2 — Realtime Q&A. Subscribe to the shared
  // /notifications socket and refetch the thread list whenever a
  // DISCUSSION_REPLY or DISCUSSION_MENTION lands for THIS lesson.
  //
  // We piggy-back on the existing bell socket instead of a dedicated
  // namespace so the connection is reused and the student sees the red
  // dot on the bell at the same time as the tab refreshes.
  useEffect(() => {
    if (!accessToken) return;
    const socket = connectNotificationsSocket(accessToken);
    const onNotification = (n: AppNotification) => {
      if (n.type !== 'DISCUSSION_REPLY' && n.type !== 'DISCUSSION_MENTION') return;
      const data = n.data as { lessonId?: string } | null | undefined;
      if (data?.lessonId !== lessonId) return;
      qc.invalidateQueries({ queryKey: ['discussions', lessonId] });
    };
    socket.on('notification', onNotification);
    return () => {
      socket.off('notification', onNotification);
      // NOTE: don't disconnect — the bell dropdown owns the lifecycle.
    };
  }, [accessToken, lessonId, qc]);

  const createThread = useMutation({
    mutationFn: (payload: { content: string; mentionUserIds?: string[] }) =>
      discussionsApi.create(lessonId, payload, accessToken!),
    onSuccess: () => {
      composerRef.current?.reset();
      setDraft('');
      qc.invalidateQueries({ queryKey: ['discussions', lessonId] });
      toast.success('Đã gửi câu hỏi');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Gửi thất bại');
    },
  });

  const submitThread = () => {
    const content = draft.trim();
    if (!content) return;
    createThread.mutate({
      content,
      mentionUserIds: composerRef.current?.getMentions() ?? [],
    });
  };

  const canDelete = (authorId: string) =>
    !!user && (user.id === authorId || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');

  return (
    <div className="space-y-5">
      {/* Composer */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <MentionComposer
            ref={composerRef}
            lessonId={lessonId}
            value={draft}
            onChange={setDraft}
            rows={3}
            placeholder="Đặt câu hỏi về bài học… Gõ @ để tag giảng viên."
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={submitThread}
              disabled={!draft.trim() || createThread.isPending}
            >
              <Send className="h-4 w-4" />
              Gửi câu hỏi
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Threads list */}
      {query.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      )}

      {query.data && query.data.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <MessageSquare className="h-8 w-8 text-muted" />
            <p className="text-sm font-semibold text-foreground">Chưa có câu hỏi nào</p>
            <p className="text-xs text-muted">Hỏi đi! Giảng viên sẽ trả lời sớm.</p>
          </CardContent>
        </Card>
      )}

      {query.data && query.data.length > 0 && (
        <ul className="space-y-3">
          {query.data.map((t) => (
            <ThreadCard
              key={t.id}
              thread={t}
              lessonId={lessonId}
              accessToken={accessToken!}
              canDelete={canDelete(t.author.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ThreadCard({
  thread,
  lessonId,
  accessToken,
  canDelete,
}: {
  thread: DiscussionThread;
  lessonId: string;
  accessToken: string;
  canDelete: boolean;
}) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [replyDraft, setReplyDraft] = useState('');
  const replyComposerRef = useRef<MentionComposerHandle>(null);

  const createReply = useMutation({
    mutationFn: (payload: { content: string; mentionUserIds?: string[] }) =>
      discussionsApi.reply(thread.id, payload, accessToken),
    onSuccess: () => {
      replyComposerRef.current?.reset();
      setReplyDraft('');
      qc.invalidateQueries({ queryKey: ['discussions', lessonId] });
    },
  });

  const submitReply = () => {
    const content = replyDraft.trim();
    if (!content) return;
    createReply.mutate({
      content,
      mentionUserIds: replyComposerRef.current?.getMentions() ?? [],
    });
  };

  const deleteThread = useMutation({
    mutationFn: () => discussionsApi.deleteThread(thread.id, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discussions', lessonId] });
      toast.success('Đã xoá thread');
    },
  });

  const deleteReply = useMutation({
    mutationFn: (replyId: string) => discussionsApi.deleteReply(replyId, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discussions', lessonId] });
      toast.success('Đã xoá reply');
    },
  });

  return (
    <li>
      <Card>
        <CardContent className="space-y-3 p-4">
          <AuthorRow
            author={thread.author}
            createdAt={thread.createdAt}
            onDelete={canDelete ? () => deleteThread.mutate() : null}
          />
          <p className="whitespace-pre-wrap text-sm text-foreground">{thread.content}</p>

          {/* Replies */}
          {thread.replies.length > 0 && (
            <ul className="space-y-2 border-l-2 border-border pl-4">
              {thread.replies.map((r) => {
                const canDeleteReply =
                  !!user &&
                  (user.id === r.author.id || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');
                return (
                  <li key={r.id} className="rounded-button bg-surface-2/30 p-3">
                    <AuthorRow
                      author={r.author}
                      createdAt={r.createdAt}
                      size="sm"
                      onDelete={canDeleteReply ? () => deleteReply.mutate(r.id) : null}
                    />
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">
                      {r.content}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Reply composer — supports @-mention same as the thread composer */}
          <div className="flex gap-2">
            <div className="flex-1">
              <MentionComposer
                ref={replyComposerRef}
                lessonId={lessonId}
                value={replyDraft}
                onChange={setReplyDraft}
                placeholder="Trả lời… (gõ @ để tag)"
                singleLine
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={submitReply}
              disabled={!replyDraft.trim() || createReply.isPending}
            >
              Gửi
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function AuthorRow({
  author,
  createdAt,
  size = 'md',
  onDelete,
}: {
  author: DiscussionThread['author'];
  createdAt: string;
  size?: 'sm' | 'md';
  onDelete: (() => void) | null;
}) {
  const roleTone =
    author.role === 'SUPER_ADMIN' || author.role === 'ADMIN'
      ? 'warning'
      : author.role === 'INSTRUCTOR'
        ? 'success'
        : 'neutral';
  const initials = author.name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(-2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex items-center gap-2.5">
      <Avatar size={size} src={author.avatar ?? undefined} initials={initials} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{author.name}</span>
          <Badge tone={roleTone}>{author.role}</Badge>
        </div>
        <p className="text-xs text-muted">{new Date(createdAt).toLocaleString('vi-VN')}</p>
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          title="Xoá"
          className="rounded p-1 text-muted hover:bg-error/10 hover:text-error transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
