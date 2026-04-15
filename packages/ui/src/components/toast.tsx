'use client';

/**
 * Toast — thin re-export of sonner with our config defaults.
 *
 * The root <Toaster /> component lives in apps/frontend/src/components/providers.tsx.
 * Anywhere else in the app, just call `toast.success(...)`, `toast.error(...)`,
 * etc. — sonner handles queueing, auto-dismiss (4s), top-right placement.
 *
 * Provided here so component callers in @lms/ui can avoid a hard sonner
 * import and so future swaps are localised.
 */
export { toast, Toaster } from 'sonner';
