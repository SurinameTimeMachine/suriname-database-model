import {
  loadResource,
  resourceJsonLd,
} from '@/lib/lod-resource';
import {
  buildGlobaliseVocabularyObject,
  isVocabularyEntity,
} from '@/lib/vocabulary-profile';
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
  const profile = request.nextUrl.searchParams.get('profile');
  if (profile && profile !== 'globalise') {
    return NextResponse.json(
      { error: `Unknown linked-data profile: ${profile}` },
      { status: 400 },
    );
  }
  if (profile === 'globalise' && !isVocabularyEntity(resource.entity)) {
    return NextResponse.json(
      { error: 'The GLOBALISE profile is only available for vocabulary resources' },
      { status: 406 },
    );
  }
  const requestedUrl = request.url;
  const json =
    request.nextUrl.searchParams.get('format') === 'json' ||
    requestedUrl.includes('.json?') ||
    requestedUrl.endsWith('.json');
  const jsonld = !json;
  const body =
    profile === 'globalise'
      ? buildGlobaliseVocabularyObject(resource.entity)
      : jsonld
        ? resourceJsonLd(resource)
        : resource.entity;
  const links = [
    `<${resource.uri}>; rel="canonical"`,
    ...(isVocabularyEntity(resource.entity)
      ? [
          `<${resource.uri}.jsonld?profile=globalise>; rel="alternate"; type="application/ld+json"`,
        ]
      : []),
  ];
  return new NextResponse(`${JSON.stringify(body, null, 2)}\n`, {
    headers: {
      'Content-Type': jsonld
        ? 'application/ld+json; charset=utf-8'
        : 'application/json; charset=utf-8',
      Link: links.join(', '),
      Vary: 'Accept',
    },
  });
}
