'use client';

import { cn } from '@lms/ui';
import { ChevronDown, ChevronRight, FileText, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { Chapter } from '@/lib/curriculum';

interface LessonTreeSidebarProps {
  chapters: Chapter[];
  currentLessonId: string;
}

/**
 * Compact lesson tree shown to the left of the editor.
 *
 * Each chapter is collapsible; clicking a lesson navigates the editor
 * to a different lesson without leaving the page (Next.js handles
 * route param transition).
 */
export function LessonTreeSidebar({ chapters, currentLessonId }: LessonTreeSidebarProps) {
  // Auto-expand the chapter containing the current lesson.
  const initialExpanded = new Set(
    chapters.filter((c) => c.lessons?.some((l) => l.id === currentLessonId)).map((c) => c.id),
  );
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-r border-border bg-surface-2/30 p-3">
      <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Cây bài học
      </h3>
      <ul className="space-y-1">
        {chapters.map((c) => {
          const isOpen = expanded.has(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm font-semibold text-foreground hover:bg-surface-2"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted" />
                )}
                <span className="flex-1 truncate text-left">{c.title}</span>
                <span className="text-xs text-muted">{c.lessons?.length ?? 0}</span>
              </button>
              {isOpen && c.lessons && (
                <ul className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
                  {c.lessons.map((l) => {
                    const Icon = l.type === 'THEORY' ? FileText : Wrench;
                    const isCurrent = l.id === currentLessonId;
                    return (
                      <li key={l.id}>
                        <Link
                          href={`/instructor/lessons/${l.id}/edit`}
                          className={cn(
                            'flex items-center gap-1.5 rounded px-2 py-1 text-sm transition-colors',
                            isCurrent
                              ? 'bg-primary/10 font-semibold text-primary'
                              : 'text-muted hover:bg-surface-2 hover:text-foreground',
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{l.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
