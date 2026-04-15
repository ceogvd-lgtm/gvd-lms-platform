'use client';

import { motion } from 'framer-motion';

import { GvdLogo } from '@/components/brand/gvd-logo';

/**
 * Decorative SVG used on the left half of the split-screen auth layout.
 * Industrial theme — cogs + circuit lines + abstract factory silhouette.
 * Pure SVG so it renders without any network fetch.
 */
export function IndustrialIllustration() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 30% 20%, rgba(124,58,237,0.35) 0%, transparent 55%), radial-gradient(circle at 70% 80%, rgba(30,64,175,0.45) 0%, transparent 60%), linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%)',
        }}
      />

      {/* Decorative grid */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.08]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#fff" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Rotating gears */}
      <motion.svg
        viewBox="0 0 200 200"
        className="absolute right-12 top-16 h-48 w-48 text-secondary-400"
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        aria-hidden
      >
        <Gear cx={100} cy={100} r={60} teeth={12} />
      </motion.svg>

      <motion.svg
        viewBox="0 0 200 200"
        className="absolute bottom-20 left-16 h-32 w-32 text-primary-300"
        animate={{ rotate: -360 }}
        transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
        aria-hidden
      >
        <Gear cx={100} cy={100} r={60} teeth={10} />
      </motion.svg>

      {/* Central content card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 max-w-md text-center text-white px-8"
      >
        <div className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-card bg-white/10 backdrop-blur-sm">
          <GvdLogo className="h-16 w-16 text-white" />
        </div>
        <h1 className="mb-3 text-4xl font-bold leading-tight">
          GVD <span className="text-secondary-300">next-gen</span>
        </h1>
        <p className="text-base text-blue-100/80 leading-relaxed">
          Hệ thống đào tạo thực hành kỹ thuật công nghiệp thế hệ mới, tích hợp AI và mô phỏng 3D.
        </p>

        {/* Circuit lines */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mx-auto mt-8 h-px w-40 origin-left bg-gradient-to-r from-transparent via-secondary-400 to-transparent"
        />
      </motion.div>
    </div>
  );
}

function Gear({ cx, cy, r, teeth }: { cx: number; cy: number; r: number; teeth: number }) {
  const path: string[] = [];
  const innerR = r;
  const outerR = r + 12;
  const toothHalfAngle = Math.PI / teeth / 2;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const a1 = a - toothHalfAngle;
    const a2 = a + toothHalfAngle;
    path.push(
      `${i === 0 ? 'M' : 'L'} ${cx + Math.cos(a1) * innerR} ${cy + Math.sin(a1) * innerR}`,
      `L ${cx + Math.cos(a1) * outerR} ${cy + Math.sin(a1) * outerR}`,
      `L ${cx + Math.cos(a2) * outerR} ${cy + Math.sin(a2) * outerR}`,
      `L ${cx + Math.cos(a2) * innerR} ${cy + Math.sin(a2) * innerR}`,
    );
  }
  path.push('Z');
  return (
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
      <path d={path.join(' ')} />
      <circle cx={cx} cy={cy} r={r * 0.5} />
      <circle cx={cx} cy={cy} r={r * 0.15} />
    </g>
  );
}
