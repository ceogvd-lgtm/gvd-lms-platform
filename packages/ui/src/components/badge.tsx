import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * Generic semantic badge — 5 colors. For role badges (gold/blue/green/gray)
 * use the role-specific RoleBadge in apps/frontend; this is the abstract
 * design-system primitive.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      tone: {
        info: 'bg-primary/10 text-primary',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        error: 'bg-error/10 text-error',
        neutral: 'bg-surface-2 text-foreground',
      },
      outline: {
        true: 'bg-transparent border',
        false: '',
      },
    },
    compoundVariants: [
      { tone: 'info', outline: true, class: 'border-primary text-primary' },
      { tone: 'success', outline: true, class: 'border-success text-success' },
      { tone: 'warning', outline: true, class: 'border-warning text-warning' },
      { tone: 'error', outline: true, class: 'border-error text-error' },
      { tone: 'neutral', outline: true, class: 'border-border' },
    ],
    defaultVariants: {
      tone: 'neutral',
      outline: false,
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, outline, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone, outline }), className)} {...props} />
  ),
);
Badge.displayName = 'Badge';

export { badgeVariants };
