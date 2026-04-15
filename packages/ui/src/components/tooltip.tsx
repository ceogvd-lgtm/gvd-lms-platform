'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * Tooltip — Radix-based, fully accessible.
 *
 * Default usage shorthand:
 *   <Tooltip content="Lý do bị disable">
 *     <Button disabled>Xoá</Button>
 *   </Tooltip>
 *
 * For more control, compose with `TooltipRoot` + `TooltipTrigger` +
 * `TooltipContent`.
 */
export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 max-w-xs rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg',
        'dark:bg-slate-100 dark:text-slate-900',
        'data-[state=delayed-open]:animate-fade-in',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

/**
 * Convenience wrapper — most callers just want `<Tooltip content="...">`.
 * Skip rendering the tooltip entirely when content is falsy.
 *
 * NOTE: requires a TooltipProvider somewhere in the tree (we add one in
 * the root Providers component for the app).
 */
export function Tooltip({ content, children, side = 'top', delayDuration = 200 }: TooltipProps) {
  if (!content) return <>{children}</>;
  return (
    <TooltipRoot delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </TooltipRoot>
  );
}
