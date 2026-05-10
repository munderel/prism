/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  eslint: {
    // Lint is already run in CI (GitHub Actions) — skip during `next build` to avoid
    // treating warnings as errors and blocking deployment.
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      { source: '/dashboard', destination: '/', permanent: true },
      { source: '/power-down', destination: '/powerdown', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://www.googleapis.com; frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
