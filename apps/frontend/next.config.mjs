/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lms/ui', '@lms/types'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
