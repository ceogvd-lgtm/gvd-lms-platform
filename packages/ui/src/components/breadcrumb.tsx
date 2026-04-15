'use client';

import { ChevronRight, MoreHorizontal } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  /** When > maxItems, collapse middle entries into a "..." menu. */
  maxItems?: number;
}

/**
 * Responsive breadcrumb. On mobile (or when `items.length > maxItems`),
 * the middle entries collapse into a single ellipsis with a hover-expand
 * tooltip. Last item is always rendered as the current page (non-link).
 */
export function Breadcrumb({ items, maxItems = 4, className, ...props }: BreadcrumbProps) {
  if (items.length === 0) return null;

  const shouldCollapse = items.length > maxItems;
  const visible: Array<BreadcrumbItem | 'ellipsis'> = shouldCollapse
    ? [items[0]!, 'ellipsis', items[items.length - 2]!, items[items.length - 1]!]
    : items;

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center text-sm', className)} {...props}>
      <ol className="flex items-center gap-1.5">
        {visible.map((item, idx) => {
          const isLast = idx === visible.length - 1;
          if (item === 'ellipsis') {
            return (
              <li key="ellipsis" className="flex items-center gap-1.5">
                <span
                  className="rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground"
                  title={items
                    .slice(1, -2)
                    .map((i) => i.label)
                    .join(' / ')}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden />
              </li>
            );
          }
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-1.5">
              {isLast || !item.href ? (
                <span
                  className={cn(
                    'truncate max-w-[200px]',
                    isLast ? 'font-semibold text-foreground' : 'text-muted',
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  className="truncate max-w-[200px] text-muted hover:text-foreground hover:underline"
                >
                  {item.label}
                </a>
              )}
              {!isLast && <ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
