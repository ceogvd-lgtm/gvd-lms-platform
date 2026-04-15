'use client';

import { ChevronDown, type LucideIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * Sidebar — collapsible 260px → 64px (icon-only) per Phase 05 spec.
 *
 * Items support nesting one level deep, an active state (highlighted
 * background + bold text), and an optional badge (e.g. unread count).
 *
 * Active detection is delegated to the caller via the `active` flag on
 * each item — keeps this component routing-agnostic.
 */

export interface SidebarItem {
  label: string;
  href?: string;
  icon?: LucideIcon;
  badge?: string | number;
  active?: boolean;
  children?: SidebarItem[];
}

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  items: SidebarItem[];
  /** Brand block at the top (logo + name). */
  brand?: React.ReactNode;
  /** Footer block at the bottom (e.g. user card). */
  footer?: React.ReactNode;
  /** Controlled collapsed state. */
  collapsed?: boolean;
}

const SIDEBAR_W = 'w-[260px]';
const SIDEBAR_W_COLLAPSED = 'w-[64px]';

export function Sidebar({
  items,
  brand,
  footer,
  collapsed = false,
  className,
  ...props
}: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border bg-surface',
        'transition-[width] duration-250 ease-out-quad',
        collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W,
        className,
      )}
      {...props}
    >
      {brand && (
        <div
          className={cn(
            'flex h-16 shrink-0 items-center border-b border-border px-4',
            collapsed && 'justify-center px-0',
          )}
        >
          {brand}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {items.map((item, idx) => (
            <SidebarItemNode key={`${item.label}-${idx}`} item={item} collapsed={collapsed} />
          ))}
        </ul>
      </nav>

      {footer && <div className="shrink-0 border-t border-border p-3">{footer}</div>}
    </aside>
  );
}

function SidebarItemNode({
  item,
  collapsed,
  depth = 0,
}: {
  item: SidebarItem;
  collapsed: boolean;
  depth?: number;
}) {
  const hasChildren = !!item.children?.length;
  const [open, setOpen] = React.useState(item.children?.some((c) => c.active) ?? false);

  const Icon = item.icon;
  const baseClasses = cn(
    'group flex items-center gap-3 rounded-button text-sm font-medium',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    item.active
      ? 'bg-primary/10 text-primary'
      : 'text-muted hover:bg-surface-2 hover:text-foreground',
    collapsed ? 'h-10 w-10 justify-center mx-auto' : 'h-10 px-3',
    depth > 0 && !collapsed && 'pl-10',
  );

  const inner = (
    <>
      {Icon && <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden />}
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge !== undefined && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {item.badge}
            </span>
          )}
          {hasChildren && (
            <ChevronDown
              className={cn('h-4 w-4 transition-transform duration-150', open && 'rotate-180')}
              aria-hidden
            />
          )}
        </>
      )}
    </>
  );

  return (
    <li>
      {hasChildren ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(baseClasses, 'w-full')}
          title={collapsed ? item.label : undefined}
        >
          {inner}
        </button>
      ) : item.href ? (
        <a
          href={item.href}
          className={baseClasses}
          title={collapsed ? item.label : undefined}
          aria-current={item.active ? 'page' : undefined}
        >
          {inner}
        </a>
      ) : (
        <div className={baseClasses} title={collapsed ? item.label : undefined}>
          {inner}
        </div>
      )}
      {hasChildren && open && !collapsed && (
        <ul className="mt-1 space-y-1">
          {item.children!.map((child, idx) => (
            <SidebarItemNode
              key={`${child.label}-${idx}`}
              item={child}
              collapsed={collapsed}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
