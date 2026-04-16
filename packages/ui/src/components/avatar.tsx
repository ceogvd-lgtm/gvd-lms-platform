'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/cn';

const avatarSizes = cva('relative inline-flex shrink-0 overflow-hidden rounded-full', {
  variants: {
    size: {
      sm: 'h-8 w-8 text-xs',
      md: 'h-10 w-10 text-sm',
      lg: 'h-12 w-12 text-base',
      xl: 'h-16 w-16 text-lg',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export interface AvatarProps
  extends
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarSizes> {
  src?: string | null;
  alt?: string;
  /** Two-letter fallback shown when image fails or is missing. */
  initials?: string;
  /** Render a green online dot in the bottom-right corner. */
  online?: boolean;
}

/**
 * Avatar with image + initials fallback + optional online indicator.
 * Built on Radix Avatar so image-load fallback timing is correct.
 */
export const Avatar = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(
  ({ className, size, src, alt, initials, online, ...props }, ref) => {
    return (
      <span className="relative inline-flex">
        <AvatarPrimitive.Root ref={ref} className={cn(avatarSizes({ size }), className)} {...props}>
          {src && (
            <AvatarPrimitive.Image
              src={src}
              alt={alt ?? initials ?? 'avatar'}
              className="aspect-square h-full w-full object-cover"
            />
          )}
          <AvatarPrimitive.Fallback
            delayMs={src ? 600 : 0}
            className="flex h-full w-full items-center justify-center bg-surface-2 font-semibold text-foreground uppercase"
          >
            {initials?.slice(0, 2) ?? '??'}
          </AvatarPrimitive.Fallback>
        </AvatarPrimitive.Root>
        {online && (
          <span
            aria-label="online"
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-background"
          />
        )}
      </span>
    );
  },
);
Avatar.displayName = 'Avatar';
