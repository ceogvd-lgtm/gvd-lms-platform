import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * Button — 5 variants × 4 sizes per Phase 05 spec.
 * Set `asChild` to render as a different element (e.g. wrap a Next <Link/>).
 *
 * Click animation (scale 0.97) is built in via active:scale-[0.97].
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium rounded-button transition-all duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-[0.97]',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-700 shadow-sm',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary-700 shadow-sm',
        outline: 'border border-border bg-transparent text-foreground hover:bg-surface-2',
        ghost: 'bg-transparent text-foreground hover:bg-surface-2',
        destructive: 'bg-error text-white hover:bg-error/90 shadow-sm',
        // Backwards-compat with Phase 03/04 callers that still use `default`
        default: 'bg-primary text-primary-foreground hover:bg-primary-700 shadow-sm',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
