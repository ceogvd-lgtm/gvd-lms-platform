import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * Shimmer skeleton placeholder. Uses the `skeleton-shimmer` background
 * defined in apps/frontend/src/app/globals.css + `animate-shimmer`
 * keyframe from the Tailwind preset.
 *
 * Common use:
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-12 w-full rounded-card" />
 */
export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('skeleton-shimmer animate-shimmer rounded-md', className)}
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';
