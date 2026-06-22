import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot,
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
