import {
  loadResource,
  resourceJsonLd,
} from '@/lib/lod-resource';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  const resource = await loadResource(path);
  if (!resource) {
    return NextResponse.json({ error: 'Unknown linked-data resource' }, { status: 404 });
  }
  const requestedUrl = request.url;
  const json =
    request.nextUrl.searchParams.get('format') === 'json' ||
    requestedUrl.includes('.json?') ||
    requestedUrl.endsWith('.json');
  const jsonld = !json;
  const body = jsonld ? resourceJsonLd(resource) : resource.entity;
  return new NextResponse(`${JSON.stringify(body, null, 2)}\n`, {
    headers: {
      'Content-Type': jsonld
        ? 'application/ld+json; charset=utf-8'
        : 'application/json; charset=utf-8',
      Link: `<${resource.uri}>; rel="canonical"`,
      Vary: 'Accept',
    },
  });
}
