import type { Config } from 'tailwindcss';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const preset = require('@lms/config/tailwind/preset');

const config: Config = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
