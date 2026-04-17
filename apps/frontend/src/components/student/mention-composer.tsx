'use client';

import { Avatar, Badge } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { useAuthStore } from '@/lib/auth-store';
import { discussionsApi, type MentionSuggestion } from '@/lib/students';

/**
 * Phase 14 gap #6 — @mention composer.
 *
 * Drop-in replacement for a plain <textarea> (or <input>) that watches
 * for "@" followed by letters and pops a dropdown of mentionable users.
 * Picking a suggestion:
 *   - inserts `@Name ` into the text at the caret position
 *   - records the user id in the `mentions` ref so the caller can POST
 *     it as `mentionUserIds` alongside the plain content
 *
 * The component intentionally keeps the text free-form (no rich-text
 * tokens) so the backend's plain `content` column stays simple and the
 * notification cascade just checks the id list.
 */
export interface MentionComposerHandle {
  /** Current mention user ids — read inside the caller's submit handler. */
  getMentions: () => string[];
  /** Reset text + mentions after a successful submit. */
  reset: () => void;
}

export interface MentionComposerProps {
  lessonId: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  /** Render as single-line `<input>` (reply) instead of `<textarea>`. */
  singleLine?: boolean;
  className?: string;
  disabled?: boolean;
}

export const MentionComposer = forwardRef<MentionComposerHandle, MentionComposerProps>(
  function MentionComposer(
    { lessonId, value, onChange, placeholder, rows = 3, singleLine = false, className, disabled },
    ref,
  ) {
    const accessToken = useAuthStore((s) => s.accessToken);
    const textareaRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
    const mentionsRef = useRef<string[]>([]);
    // Active "@" query — null when no dropdown is open.
    const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
    const [highlight, setHighlight] = useState(0);

    useImperativeHandle(
      ref,
      () => ({
        getMentions: () => [...mentionsRef.current],
        reset: () => {
          mentionsRef.current = [];
          onChange('');
        },
      }),
      [onChange],
    );

    // Fetch suggestions — skipped when dropdown is closed so we don't
    // spam the backend on every keystroke outside of a mention context.
    const suggestionsQ = useQuery({
      queryKey: ['mentionable', lessonId, query?.text ?? ''],
      queryFn: () => discussionsApi.mentionable(lessonId, query?.text ?? '', accessToken!),
      enabled: !!accessToken && query !== null,
      staleTime: 5_000,
    });

    // Reset highlight whenever the suggestion list changes length.
    useEffect(() => setHighlight(0), [suggestionsQ.data?.length]);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const next = e.target.value;
      onChange(next);
      const caret = e.target.selectionStart ?? next.length;
      updateQueryFromCaret(next, caret);
    };

    function updateQueryFromCaret(text: string, caret: number) {
      // Look back from caret for the last "@" not preceded by a word char.
      let i = caret - 1;
      while (i >= 0) {
        const ch = text[i]!;
        if (ch === '@') {
          const prev = i > 0 ? text[i - 1] : ' ';
          // Must be at start or after whitespace — prevents picking up
          // "@" inside email addresses.
          if (i === 0 || /\s/.test(prev!)) {
            const sliceEnd = caret;
            const q = text.slice(i + 1, sliceEnd);
            if (/^[\p{L}\p{N}\-_]*$/u.test(q)) {
              setQuery({ text: q, start: i });
              return;
            }
          }
          break;
        }
        if (/\s/.test(ch)) break;
        i--;
      }
      setQuery(null);
    }

    const pick = (s: MentionSuggestion) => {
      if (!query) return;
      const before = value.slice(0, query.start);
      const after = value.slice(query.start + 1 + query.text.length);
      const insertion = `@${s.name} `;
      const nextVal = before + insertion + after;
      if (!mentionsRef.current.includes(s.id)) {
        mentionsRef.current = [...mentionsRef.current, s.id];
      }
      onChange(nextVal);
      setQuery(null);
      // Re-focus + place caret right after the inserted mention.
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        const pos = before.length + insertion.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (!query || !suggestionsQ.data || suggestionsQ.data.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestionsQ.data!.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestionsQ.data!.length) % suggestionsQ.data!.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(suggestionsQ.data[highlight]!);
      } else if (e.key === 'Escape') {
        setQuery(null);
      }
    };

    const Input = singleLine ? 'input' : 'textarea';

    return (
      <div className="relative">
        <Input
          ref={textareaRef as never}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={singleLine ? undefined : rows}
          disabled={disabled}
          className={
            className ??
            (singleLine
              ? 'h-9 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20'
              : 'w-full rounded-button border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20')
          }
        />

        {query !== null && (
          <div className="absolute left-2 z-50 mt-1 max-h-60 w-64 overflow-y-auto rounded-card border border-border bg-background shadow-lg">
            {suggestionsQ.isLoading && <div className="p-3 text-xs text-muted">Đang tìm…</div>}
            {!suggestionsQ.isLoading && (suggestionsQ.data?.length ?? 0) === 0 && (
              <div className="p-3 text-xs text-muted">Không tìm thấy ai phù hợp.</div>
            )}
            {suggestionsQ.data?.map((s, i) => {
              const initials = s.name
                .split(' ')
                .map((p) => p[0])
                .filter(Boolean)
                .slice(-2)
                .join('')
                .toUpperCase();
              const tone: 'warning' | 'success' =
                s.role === 'SUPER_ADMIN' || s.role === 'ADMIN' ? 'warning' : 'success';
              return (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => {
                    // mousedown (not click) so the textarea doesn't lose
                    // focus before we can set the caret.
                    e.preventDefault();
                    pick(s);
                  }}
                  className={
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ' +
                    (i === highlight ? 'bg-primary/10' : 'hover:bg-surface-2')
                  }
                >
                  <Avatar size="sm" src={s.avatar ?? undefined} initials={initials} />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {s.name}
                  </span>
                  <Badge tone={tone}>{s.role}</Badge>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);
