import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
// pnpm workspace root (one level up) so Turbopack can resolve hoisted deps like `next`
const workspaceRoot = path.dirname(appRoot);

const nextConfig: NextConfig = {
  turbopack: {
    root: workspaceRoot,
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
