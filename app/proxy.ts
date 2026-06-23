import { NextRequest, NextResponse } from 'next/server';

const RECORD_PATH = /^\/place\/(stm-\d{5})\.(jsonld|json)$/;
const HTML_RECORD_PATH = /^\/place\/(stm-\d{5})$/;

export function proxy(request: NextRequest) {
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

  return NextResponse.next();
}

export const config = { matcher: ['/place/:path*'] };
