'use client';

import { motion } from 'framer-motion';

import { IndustrialIllustration } from './industrial-illustration';

/**
 * Split-screen shell for auth pages:
 *   left  — industrial illustration (hidden on mobile < lg)
 *   right — form card, fade+slide-up on mount
 */
export function SplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-dark-bg">
      {/* Left — illustration */}
      <div className="hidden lg:flex lg:w-1/2">
        <IndustrialIllustration />
      </div>

      {/* Right — form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center px-4 sm:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
