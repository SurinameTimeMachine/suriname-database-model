import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot,
  },
  // The NAS photo-review tool's API routes (start/claim/submit/status) read the
  // records JSON from disk at runtime, so the file tracer must bundle the
  // in-tree copy produced by scripts/sync-nas-records.ts into each function.
  outputFileTracingIncludes: {
    '/api/event/start': ['./lib/nas-mediabank-records.json'],
    '/api/event/claim': ['./lib/nas-mediabank-records.json'],
    '/api/event/submit': ['./lib/nas-mediabank-records.json'],
    '/api/event/status': ['./lib/nas-mediabank-records.json'],
  },
  async headers() {
    return [
      {
        source: '/data/:path*.jsonld',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/ld+json; charset=utf-8',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
