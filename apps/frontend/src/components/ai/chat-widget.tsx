'use client';

import { Button, cn } from '@lms/ui';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Bot, Send, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { toast } from 'sonner';

import { aiApi, streamChat, type ChatHistoryTurn, type ChatStreamFrame } from '@/lib/ai';
import { useAuthStore } from '@/lib/auth-store';

interface ChatWidgetProps {
  lessonId?: string;
  /** Questions from `suggested-questions` — clicking fills the input. */
  suggestedQuestions?: string[];
}

interface Turn {
  id?: string;
  role: 'user' | 'model';
  content: string;
  rating?: 1 | -1;
  streaming?: boolean;
}

/**
 * Floating AI chat widget (Phase 17).
 *
 * - Bottom-right button opens a 380×520 card (full-screen on < 640px).
 * - Streams responses via SSE from /api/v1/ai/chat.
 * - Persists each user + model turn server-side; a model-turn id lets
 *   the student thumbs-up/down after the stream ends.
 * - Graceful fallback when Gemini is disabled / quota exceeded —
 *   the assistant row switches to an error banner.
 */
export function AiChatWidget({ lessonId, suggestedQuestions = [] }: ChatWidgetProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever turns change
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [turns]);

  // Abort in-flight stream on unmount / close
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const sendMessage = async (message: string) => {
    if (!accessToken || !message.trim() || isStreaming) return;
    setErrorCode(null);
    const history: ChatHistoryTurn[] = turns
      .filter((t) => !t.streaming)
      .map((t) => ({ role: t.role, content: t.content }));

    setTurns((prev) => [
      ...prev,
      { role: 'user', content: message },
      { role: 'model', content: '', streaming: true },
    ]);
    setInput('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(accessToken, {
        message,
        lessonId,
        history,
        sessionId,
        signal: controller.signal,
        onFrame: (frame: ChatStreamFrame) => {
          if (frame.sessionId && !sessionId) setSessionId(frame.sessionId);
          if (frame.error) {
            setErrorCode(frame.error);
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.streaming) {
                last.streaming = false;
                last.content = errorMessage(frame.error!);
              }
              return next;
            });
            return;
          }
          if (frame.text) {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'model') {
                last.content += frame.text ?? '';
              }
              return next;
            });
          }
          if (frame.messageId) {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'model') {
                last.id = frame.messageId;
              }
              return next;
            });
          }
          if (frame.done) {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last) last.streaming = false;
              return next;
            });
          }
        },
      });
    } catch (err) {
      toast.error((err as Error).message);
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.streaming) {
          last.streaming = false;
          last.content = 'Lỗi kết nối tới trợ lý AI.';
        }
        return next;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const rate = async (turn: Turn, value: 1 | -1) => {
    if (!turn.id || !accessToken) return;
    try {
      await aiApi.rateMessage(turn.id, value, accessToken);
      setTurns((prev) => prev.map((t) => (t.id === turn.id ? { ...t, rating: value } : t)));
    } catch (err) {
      toast.error('Không gửi được đánh giá');
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'fixed right-5 bottom-5 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl',
          'bg-gradient-to-br from-[#7C3AED] to-[#1E40AF]',
          'transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
        )}
        aria-label={open ? 'Đóng trợ lý AI' : 'Mở trợ lý AI'}
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className={cn(
              'fixed right-5 bottom-24 z-40 flex flex-col overflow-hidden rounded-[20px] shadow-2xl',
              'border border-slate-200 bg-white text-slate-900',
              'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
              // Desktop sizing
              'w-[380px] h-[520px]',
              // Mobile: full-screen (< sm = 640px)
              'max-sm:inset-0 max-sm:right-0 max-sm:bottom-0 max-sm:h-full max-sm:w-full max-sm:rounded-none',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-[#7C3AED] to-[#1E40AF] px-4 py-3 text-white dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">Trợ lý AI</span>
                  <span className="text-[11px] opacity-80">Gemini · GVD LMS</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 transition hover:bg-white/10"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950"
            >
              {turns.length === 0 && (
                <EmptyState suggestions={suggestedQuestions} onPick={sendMessage} />
              )}
              {turns.map((turn, i) => (
                <MessageRow key={i} turn={turn} onRate={rate} />
              ))}
              {errorCode && (
                <div className="flex items-center gap-2 rounded-lg border border-error/40 bg-error/5 p-2 text-xs text-error">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMessage(errorCode)}</span>
                </div>
              )}
            </div>

            {/* Suggested chips (only shown once we have a conversation going) */}
            {turns.length > 0 && suggestedQuestions.length > 0 && (
              <div className="flex gap-2 overflow-x-auto border-t border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                {suggestedQuestions.slice(0, 5).map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setInput(q)}
                    className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 transition hover:border-primary hover:text-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Composer */}
            <form
              className="flex items-end gap-2 border-t border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder="Hỏi trợ lý AI..."
                rows={1}
                disabled={isStreaming}
                className="min-h-[40px] max-h-[120px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <Button
                type="submit"
                size="sm"
                disabled={isStreaming || !input.trim()}
                className="h-10"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function EmptyState({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (q: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="rounded-full bg-gradient-to-br from-[#7C3AED] to-[#1E40AF] p-3 text-white">
        <Sparkles className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        Xin chào! Tôi có thể giúp gì cho bạn?
      </p>
      <p className="max-w-[260px] text-xs text-slate-500 dark:text-slate-400">
        Hỏi về khái niệm kỹ thuật, quy trình vận hành, hoặc quy tắc an toàn lao động.
      </p>
      {suggestions.length > 0 && (
        <div className="flex w-full flex-col gap-2 pt-2">
          {suggestions.slice(0, 5).map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(q)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 transition hover:border-primary hover:text-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({ turn, onRate }: { turn: Turn; onRate: (t: Turn, v: 1 | -1) => void }) {
  const isUser = turn.role === 'user';
  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-white'
            : 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100',
          !isUser && turn.streaming ? 'animate-pulse-subtle' : '',
        )}
      >
        {!isUser && turn.streaming && turn.content.length === 0 ? (
          <TypingIndicator />
        ) : isUser ? (
          <span className="whitespace-pre-wrap break-words">{turn.content}</span>
        ) : (
          <MarkdownBody content={turn.content} />
        )}

        {!isUser && !turn.streaming && turn.id && (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <button
              type="button"
              onClick={() => onRate(turn, 1)}
              className={cn(
                'rounded p-1 transition hover:text-success',
                turn.rating === 1 && 'text-success',
              )}
              aria-label="Hữu ích"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onRate(turn, -1)}
              className={cn(
                'rounded p-1 transition hover:text-error',
                turn.rating === -1 && 'text-error',
              )}
              aria-label="Không hữu ích"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MarkdownBody({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown
        components={{
          code({
            inline,
            className,
            children,
            ...props
          }: {
            inline?: boolean;
            className?: string;
            children?: React.ReactNode;
          }) {
            const match = /language-(\w+)/.exec(className ?? '');
            if (!inline && match) {
              return (
                <SyntaxHighlighter
                  language={match[1]}
                  style={oneDark}
                  PreTag="div"
                  customStyle={{
                    borderRadius: 8,
                    fontSize: 12,
                    margin: '4px 0',
                  }}
                >
                  {String(children ?? '').replace(/\n$/, '')}
                </SyntaxHighlighter>
              );
            }
            return (
              <code
                className={cn(
                  'rounded bg-slate-100 px-1 py-0.5 text-[0.85em] dark:bg-slate-700',
                  className,
                )}
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-slate-500 dark:text-slate-400">Gemini đang trả lời</span>
      <span className="inline-flex gap-0.5">
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
      </span>
    </span>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case 'quota_exceeded':
      return 'Hệ thống AI đã đạt giới hạn hôm nay, vui lòng thử lại sau.';
    case 'ai_disabled':
      return 'Trợ lý AI chưa được cấu hình.';
    case 'ai_error':
    default:
      return 'AI tạm thời không khả dụng.';
  }
}
