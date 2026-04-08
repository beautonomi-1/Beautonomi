import withBundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Expose Sentry DSN to client (NEXT_PUBLIC_* from .env.local also work; this ensures it's available)
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  // Enable React strict mode for better performance debugging
  reactStrictMode: true,

  // pdfkit → fontkit ESM hits a Turbopack/@swc/helpers mismatch ("applyDecoratedDescriptor").
  // Externalize so the route uses Node resolution (same pattern as other native-heavy libs).
  serverExternalPackages: ['pdfkit', 'fontkit'],

  // Transpile monorepo packages for proper module resolution
  transpilePackages: [
    "@beautonomi/ui-tokens",
    "@beautonomi/i18n",
    "@beautonomi/phone",
    "@beautonomi/types",
    "@beautonomi/api",
    "@beautonomi/analytics",
    "@beautonomi/config",
    "@beautonomi/utils",
  ],
  
  // Optimize images – Supabase storage: specific host from env, then any *.supabase.co
  images: (() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseHost = supabaseUrl.startsWith('https://')
      ? supabaseUrl.replace(/^https:\/\//, '').replace(/\/$/, '').split('/')[0]
      : null;
    const patterns = [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ];
    if (supabaseHost && supabaseHost.endsWith('.supabase.co')) {
      patterns.unshift({
        protocol: 'https',
        hostname: supabaseHost,
        port: '',
        pathname: '/storage/v1/object/public/**',
      });
    }
    return {
      formats: ['image/avif', 'image/webp'],
      deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
      imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
      minimumCacheTTL: 60,
      dangerouslyAllowSVG: true,
      contentDispositionType: 'attachment',
      contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
      remotePatterns: patterns,
    };
  })(),

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Experimental features for performance
  experimental: {
    // Lowers peak RSS during `next build --webpack` (important on ~7GB CI / default Vercel builders).
    webpackMemoryOptimizations: true,
    // Exclude @radix-ui/react-select to avoid Turbopack HMR "module factory is not available" errors
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-popover',
      'recharts',
    ],
  },

  // Turbopack config placeholder (required alongside custom webpack when using `next build --turbo` in some setups).
  // Default scripts use Webpack for dev/build so App Router API routes with dynamic segments resolve correctly.
  turbopack: {},

  // Never use a client cacheGroup with a fixed `name: "vendor"` (same logical chunk id for JS + CSS
  // breaks the manifest: the browser loads vendor.css as a script → MIME / SyntaxError).
  // Strip it if present (e.g. stale tooling) and avoid replacing Next's default client splitChunks.
  webpack: (config, { dev, isServer }) => {
    // Cap parallel module work in production builds to avoid OOM on 7–8GB runners (heap alone can exceed RAM).
    if (!dev) {
      config.parallelism = Math.min(config.parallelism ?? 100, 1);
    }
    // Windows dev: persistent webpack filesystem cache under .next/dev/cache/webpack can hit ENOENT
    // (missing *.pack.gz / routes-manifest) after partial deletes or restarts while compiling → 500 ISE.
    // Memory-only cache is slower but avoids a corrupted pack leaving the server unusable until full clean.
    if (dev) {
      config.cache = false;
    }
    if (!isServer && config.optimization?.splitChunks?.cacheGroups) {
      const groups = config.optimization.splitChunks.cacheGroups;
      for (const key of Object.keys(groups)) {
        if (groups[key]?.name === 'vendor') {
          delete groups[key];
        }
      }
    }
    return config;
  },

  // Redirects for canonical legal URLs (mobile apps may link to /terms)
  async redirects() {
    return [
      { source: '/terms', destination: '/terms-and-condition', permanent: true },
      { source: '/terms-of-service', destination: '/terms-and-condition', permanent: true },
      // Legacy clients request /favicon.ico; serve the Beautonomi symbol (same as /icon.svg).
      { source: '/favicon.ico', destination: '/icon.svg', permanent: false },
    ];
  },

  // Headers for caching & security
  async headers() {
    return [
      // Admin SPA static chunks (Vite) — long cache; hashed filenames.
      {
        source: '/admin/assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Admin HTML shell — short TTL when SPA routing is enabled (see `src/proxy.ts` + admin cutover docs).
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, must-revalidate',
          },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      // CORS for public booking / search endpoints — open to all origins so that
      // express booking links embedded in third-party sites work correctly.
      {
        source: '/api/public/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With, X-App' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
      // CORS for authenticated/admin API routes — restrict to known origins.
      // React Native mobile apps do not send Origin headers so they are unaffected.
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.co.za',
          },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With, X-App' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // HSTS: enforce HTTPS for 1 year, include subdomains
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          // Restrict browser feature access
          {
            key: 'Permissions-Policy',
            value: [
              'camera=()',
              'microphone=()',
              'geolocation=(self)',
              'payment=(self)',
              'usb=()',
              'magnetometer=()',
              'gyroscope=()',
              'accelerometer=()',
            ].join(', '),
          },
          // Content Security Policy
          // Next.js requires 'unsafe-inline' for runtime styles. 'unsafe-eval' is
          // required by Mapbox GL JS and some analytics SDKs.
          // TODO: Migrate to nonce-based CSP when Next.js stable nonce support lands.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Scripts: self + inline (Next hydration) + CDN SDKs
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io https://cdn.onesignal.com https://cdn.amplitude.com https://maps.googleapis.com https://api.mapbox.com https://va.vercel-scripts.com https://vercel.live",
              // Styles: self + inline (Tailwind runtime)
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Fonts
              "font-src 'self' data: https://fonts.gstatic.com",
              // Images: supabase storage + maps + data URIs
              "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://maps.googleapis.com https://maps.gstatic.com https://api.mapbox.com https://events.mapbox.com https://flagcdn.com",
              // XHR/fetch/WebSocket
              "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://api.onesignal.com https://*.sentry.io https://*.amplitude.com https://api.paystack.co https://api.mapbox.com https://events.mapbox.com",
              // Iframes (Paystack popup uses an iframe)
              "frame-src 'self' https://checkout.paystack.com https://js.paystack.co",
              // Workers (Next.js, service workers)
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
      // Do not set Cache-Control on `/_next/static/*` — Next.js applies hashed-filename caching;
      // overriding it triggers a production warning and can fight the framework defaults.
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Cache public API routes at the edge
      {
        source: '/api/public/home',
        headers: [
          {
            key: 'Cache-Control',
            value: 's-maxage=60, stale-while-revalidate=300',
          },
        ],
      },
      {
        source: '/api/public/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 's-maxage=30, stale-while-revalidate=300',
          },
        ],
      },
    ];
  },
};

const configWithAnalyzer = analyzer(nextConfig);

export default withSentryConfig(configWithAnalyzer, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
