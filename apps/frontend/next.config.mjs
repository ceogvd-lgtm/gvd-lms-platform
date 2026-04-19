/** @type {import('next').NextConfig} */

// Where MinIO is reachable from the browser. In dev it's localhost:9000;
// in prod it's whatever MINIO_PUBLIC_BASE_URL resolves to.
const MINIO_PUBLIC_BASE_URL =
  process.env.MINIO_PUBLIC_BASE_URL ?? 'http://localhost:9000/lms-uploads';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lms/ui', '@lms/types'],
  experimental: {
    typedRoutes: true,
  },
  /**
   * Same-origin proxy for SCORM packages.
   *
   * SCORM SCOs call `window.parent.API.LMSInitialize()` / `LMSSetValue()`
   * etc. to report progress back to the host LMS. Browsers enforce the
   * same-origin policy for that cross-frame property access, so if the
   * iframe is loaded from `localhost:9000` (MinIO) while the host LMS is
   * on `localhost:3000` (Next), every API call is silently blocked and
   * the SCO (Articulate Storyline, Captivate, …) just sits on its
   * loading screen forever.
   *
   * By routing SCORM content through Next's own origin via this rewrite,
   * the iframe and parent share an origin and the bridge works. The
   * rewrite streams bytes from MinIO without mutation, so presigned
   * logic / public-read policy are unaffected.
   *
   * WebGL intentionally does NOT go through this proxy — Unity's bridge
   * uses postMessage (which works cross-origin), and keeping WebGL on
   * MinIO's host lets browsers offload the large .wasm/.data transfers.
   */
  async rewrites() {
    return [
      {
        source: '/scorm-content/:path*',
        destination: `${MINIO_PUBLIC_BASE_URL}/content/scorm/:path*`,
      },
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:4000/api/v1/:path*',
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://localhost:4000/socket.io/:path*',
      },
      {
        source: '/minio/:path*',
        destination: 'http://localhost:9000/lms-uploads/:path*',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'ngrok-skip-browser-warning', value: 'true' },
        ],
      },
    ];
  },
};

export default nextConfig;
