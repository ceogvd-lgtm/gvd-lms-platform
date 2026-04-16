'use client';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lms/ui';

import type { AuditLogEntry } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  entry: AuditLogEntry | null;
}

/**
 * Audit log detail modal — shows a JSON diff of oldValue/newValue for
 * an audit entry. Useful for investigating "what exactly did this admin
 * change" without running through the DB.
 */
export function AuditDetailModal({ open, onClose, entry }: Props) {
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Chi tiết Audit Log</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Thời gian</p>
              <p className="mt-1 font-mono text-xs">
                {new Date(entry.createdAt).toLocaleString('vi-VN')}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">IP</p>
              <p className="mt-1 font-mono text-xs">{entry.ipAddress}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Người thực hiện
              </p>
              <p className="mt-1">
                {entry.user.name} <span className="text-muted">({entry.user.email})</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Hành động</p>
              <code className="mt-1 inline-block rounded bg-surface-2 px-2 py-0.5 font-mono text-xs">
                {entry.action}
              </code>
            </div>
            <div className="col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Target</p>
              <p className="mt-1 text-xs">
                <span className="font-semibold">{entry.targetType}</span>
                {' · '}
                <span className="font-mono text-muted">{entry.targetId}</span>
              </p>
            </div>
          </div>

          {/* Old/New diff — side-by-side */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                Trước (oldValue)
              </p>
              <pre className="max-h-64 overflow-auto rounded-card border border-border bg-surface-2/40 p-3 text-xs">
                {entry.oldValue ? JSON.stringify(entry.oldValue, null, 2) : '(không có)'}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                Sau (newValue)
              </p>
              <pre className="max-h-64 overflow-auto rounded-card border border-border bg-surface-2/40 p-3 text-xs">
                {entry.newValue ? JSON.stringify(entry.newValue, null, 2) : '(không có)'}
              </pre>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
