'use client';

import { Avatar, Badge, Button, Card, CardContent } from '@lms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useAuthStore } from '@/lib/auth-store';
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

  const query = useQuery({
    queryKey: ['discussions', lessonId],
    queryFn: () => discussionsApi.list(lessonId, accessToken!),
    enabled: !!accessToken,
    refetchOnWindowFocus: true,
  });

  const createThread = useMutation({
    mutationFn: (content: string) => discussionsApi.create(lessonId, content, accessToken!),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['discussions', lessonId] });
      toast.success('Đã gửi câu hỏi');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Gửi thất bại');
    },
  });

  const canDelete = (authorId: string) =>
    !!user && (user.id === authorId || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');

  return (
    <div className="space-y-5">
      {/* Composer */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Đặt câu hỏi về bài học… Giảng viên sẽ nhận được thông báo."
            className="w-full rounded-button border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => createThread.mutate(draft.trim())}
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

  const createReply = useMutation({
    mutationFn: (content: string) => discussionsApi.reply(thread.id, content, accessToken),
    onSuccess: () => {
      setReplyDraft('');
      qc.invalidateQueries({ queryKey: ['discussions', lessonId] });
    },
  });

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

          {/* Reply composer */}
          <div className="flex gap-2">
            <input
              type="text"
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              placeholder="Trả lời…"
              className="h-9 flex-1 rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => createReply.mutate(replyDraft.trim())}
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
