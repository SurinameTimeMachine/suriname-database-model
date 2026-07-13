import { NextRequest, NextResponse } from 'next/server';

const PLACE_ID = 'stm-[a-z0-9]+(?:-[a-z0-9]+)*';
const RECORD_PATH = new RegExp(`^/place/(${PLACE_ID})\\.(jsonld|json)$`);
const HTML_RECORD_PATH = new RegExp(`^/place/(${PLACE_ID})$`);
const RESOURCE_PREFIX =
  '(?:appellation|database|feature|image|inference|obs|organization|place|plantation|production|provenance|rule|source|timespan|type|visual-item|vocabulary)';
const RESOURCE_PATH = new RegExp(`^/(${RESOURCE_PREFIX}(?:/[^.?#]+)*?)(?:\\.(jsonld|json))?$`);

export function proxy(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const extensionMatch = pathname.match(RECORD_PATH);
  if (extensionMatch) {
    const [, id, extension] = extensionMatch;
    const url = new URL(`/api/place/${id}`, request.url);
    url.searchParams.set('format', extension === 'json' ? 'json' : 'jsonld');
    return NextResponse.rewrite(url);
  }

  if (
    HTML_RECORD_PATH.test(pathname) &&
    request.headers.get('accept')?.includes('application/ld+json')
  ) {
    const id = pathname.split('/').pop()!;
    return NextResponse.rewrite(new URL(`/api/place/${id}`, request.url));
  }

  const resourceMatch = pathname.match(RESOURCE_PATH);
  if (resourceMatch) {
    const [, path, extension] = resourceMatch;
    const wantsJsonLd =
      extension === 'jsonld' ||
      (!extension && request.headers.get('accept')?.includes('application/ld+json'));
    if (extension || wantsJsonLd) {
      const url = new URL(`/api/resource/${path}`, request.url);
      url.searchParams.set('format', extension === 'json' ? 'json' : 'jsonld');
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/place/:path*',
    '/appellation/:path*',
    '/database',
    '/database.:path*',
    '/feature/:path*',
    '/image/:path*',
    '/inference/:path*',
    '/obs/:path*',
    '/organization/:path*',
    '/plantation/:path*',
    '/production/:path*',
    '/provenance/:path*',
    '/rule/:path*',
    '/source/:path*',
    '/timespan/:path*',
    '/type/:path*',
    '/vocabulary/:path*',
    '/visual-item/:path*',
  ],
};
