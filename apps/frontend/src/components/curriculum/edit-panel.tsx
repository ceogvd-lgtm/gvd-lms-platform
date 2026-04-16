'use client';

import { cn } from '@lms/ui';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import * as React from 'react';

/**
 * Right-side slide-in panel for editing a tree node.
 *
 * Not using the existing <Dialog /> from @lms/ui because Dialog is a
 * centered modal — curriculum UX needs a drawer that doesn't obscure the
 * tree on the left. Hand-rolled with framer-motion.
 */
export interface EditPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: string;
}

export function EditPanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'w-[480px]',
}: EditPanelProps) {
  // ESC-to-close
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className={cn(
              'fixed inset-y-0 right-0 z-50 flex flex-col bg-surface shadow-2xl border-l border-border',
              width,
            )}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <header className="flex items-start justify-between border-b border-border px-6 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground truncate">{title}</h2>
                {subtitle && <p className="mt-0.5 text-xs text-muted truncate">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
