'use client';

import { cn } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { Hash, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { questionsApi } from '@/lib/assessments';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Deterministic hash → pastel hue so every tag gets a stable colour without
 * storing one. Good enough for 200+ tags without collisions you can see.
 */
function tagTone(tag: string): { bg: string; text: string; ring: string } {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return {
    bg: `hsl(${hue}, 85%, 92%)`,
    text: `hsl(${hue}, 65%, 30%)`,
    ring: `hsl(${hue}, 60%, 55%)`,
  };
}

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Tag input with autocomplete from `/api/v1/questions/tags`.
 *
 * - Enter / comma commit the current buffer as a new tag.
 * - Backspace on empty input removes the last committed tag.
 * - Click a suggestion to add.
 * - Stable per-tag colour via `tagTone()`.
 */
export function TagInput({ tags, onChange, placeholder, disabled, className }: TagInputProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [buffer, setBuffer] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestionsQuery = useQuery({
    queryKey: ['question-tags', buffer],
    queryFn: () => questionsApi.tags(buffer || undefined, accessToken!, 20),
    enabled: !!accessToken && open,
    staleTime: 30_000,
  });

  const suggestions = (suggestionsQuery.data?.tags ?? []).filter((t) => !tags.includes(t.tag));

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function commit(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag) return;
    if (tags.includes(tag)) {
      setBuffer('');
      return;
    }
    onChange([...tags, tag]);
    setBuffer('');
  }

  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        className={cn(
          'flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-button border border-border bg-surface px-2.5 py-1.5',
          'focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15',
          disabled && 'opacity-60',
        )}
      >
        {tags.map((tag) => {
          const tone = tagTone(tag);
          return (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{
                background: tone.bg,
                color: tone.text,
                boxShadow: `inset 0 0 0 1px ${tone.ring}55`,
              }}
            >
              <Hash className="h-2.5 w-2.5" />
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(tag);
                  }}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                  aria-label={`Xoá thẻ ${tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          value={buffer}
          disabled={disabled}
          onChange={(e) => {
            setBuffer(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit(buffer);
            } else if (e.key === 'Backspace' && buffer.length === 0 && tags.length > 0) {
              remove(tags[tags.length - 1]!);
            }
          }}
          placeholder={tags.length === 0 ? (placeholder ?? 'Nhập thẻ rồi Enter…') : ''}
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-card border border-border bg-surface shadow-lg">
          {suggestions.map((s) => {
            const tone = tagTone(s.tag);
            return (
              <button
                key={s.tag}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(s.tag);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{ background: tone.bg, color: tone.text }}
                >
                  <Hash className="h-2.5 w-2.5" />
                  {s.tag}
                </span>
                <span className="text-xs text-muted">{s.count}</span>
              </button>
            );
          })}
          {buffer.trim() && !suggestions.some((s) => s.tag === buffer.trim().toLowerCase()) && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(buffer);
              }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-primary hover:bg-primary/10"
            >
              <Hash className="h-3.5 w-3.5" />
              Tạo thẻ mới: <strong className="ml-1">{buffer.trim().toLowerCase()}</strong>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
