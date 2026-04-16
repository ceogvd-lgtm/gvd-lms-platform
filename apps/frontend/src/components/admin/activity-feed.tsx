'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@lms/ui';
import { Activity, BookOpen, LogIn, ShieldCheck } from 'lucide-react';

import { RoleBadge } from '@/components/ui/role-badge';
import type { ActivityItem } from '@/lib/api';
import type { Role } from '@/lib/rbac';

const TYPE_ICON = {
  AUDIT: ShieldCheck,
  LOGIN: LogIn,
  ENROLL: BookOpen,
} as const;

const TYPE_COLOR = {
  AUDIT: 'text-primary bg-primary/10',
  LOGIN: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  ENROLL: 'text-secondary bg-secondary/10',
} as const;

interface ActivityFeedProps {
  items: ActivityItem[];
  loading?: boolean;
}

export function ActivityFeed({ items, loading }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Hoạt động gần đây
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 animate-pulse">
                <div className="h-8 w-8 shrink-0 rounded-full bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-4/5 rounded bg-surface-2" />
                  <div className="h-2 w-2/5 rounded bg-surface-2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">Chưa có hoạt động nào gần đây.</div>
        ) : (
          <ul className="space-y-4">
            {items.map((item) => {
              const Icon = TYPE_ICON[item.type];
              return (
                <li key={item.id} className="flex items-start gap-3">
                  <div
                    className={
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full ' +
                      TYPE_COLOR[item.type]
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-foreground">{item.userName}</span>
                      <RoleBadge role={item.userRole as Role} />
                    </div>
                    <p className="text-xs text-muted">
                      <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">
                        {item.action}
                      </code>
                      {item.target && <span className="ml-1">→ {item.target}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {new Date(item.timestamp).toLocaleString('vi-VN')}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
