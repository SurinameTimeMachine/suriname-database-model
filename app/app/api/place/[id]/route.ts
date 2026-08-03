import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  buildReadablePlaceObject,
  type PlaceRecordDocument,
} from '@/lib/place-profile';
import { NextRequest, NextResponse } from 'next/server';

const PLACE_ID = /^stm-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CANONICAL_BASE = 'https://data.surinametijdmachine.org';
const GAZETTEER_PATH = join(
  process.cwd(),
  '..',
  'data',
  'places-gazetteer.jsonld',
);
type GazetteerDocument = {
  '@graph'?: Array<{ id?: string; mergedInto?: string }>;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!PLACE_ID.test(id)) {
    return NextResponse.json({ error: 'Unknown place identifier' }, { status: 404 });
  }

  const profile = request.nextUrl.searchParams.get('profile');
  if (profile && profile !== 'globalise' && profile !== 'complete') {
    return NextResponse.json(
      { error: `Unknown linked-data profile: ${profile}` },
      { status: 400 },
    );
  }
  const requestedUrl = request.url;
  const format =
    request.nextUrl.searchParams.get('format') === 'json' ||
    requestedUrl.includes('.json?') ||
    requestedUrl.endsWith('.json')
      ? 'json'
      : 'jsonld';
  let mergedInto: string | undefined;
  try {
    const gazetteer = JSON.parse(
      await readFile(GAZETTEER_PATH, 'utf-8'),
    ) as GazetteerDocument;
    mergedInto = gazetteer['@graph']?.find(
      (place) => place.id === id,
    )?.mergedInto;
  } catch {
    mergedInto = undefined;
  }
  if (mergedInto && PLACE_ID.test(mergedInto)) {
    const redirectUrl = new URL(`/place/${mergedInto}.${format}`, request.url);
    if (profile) redirectUrl.searchParams.set('profile', profile);
    return NextResponse.redirect(redirectUrl, 308);
  }

  try {
    const readableJsonLd = format === 'jsonld' && profile !== 'complete';
    const sourceFormat = readableJsonLd ? 'jsonld' : format;
    const recordResponse = await fetch(
      new URL(`/data/place-records/${id}.${sourceFormat}`, request.url),
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!recordResponse.ok) throw new Error('Record not found');
    const sourceBody = await recordResponse.text();
    const body =
      readableJsonLd
        ? `${JSON.stringify(
            buildReadablePlaceObject(
              JSON.parse(sourceBody) as PlaceRecordDocument,
            ),
            null,
            2,
          )}\n`
        : sourceBody;
    return new NextResponse(body, {
      headers: {
        'Content-Type':
          format === 'jsonld'
            ? 'application/ld+json; charset=utf-8'
            : 'application/json; charset=utf-8',
        Link: [
          `<${CANONICAL_BASE}/place/${id}>; rel="canonical"`,
          `<${CANONICAL_BASE}/place/${id}.jsonld>; rel="alternate"; type="application/ld+json"`,
          `<${CANONICAL_BASE}/place/${id}.jsonld?profile=complete>; rel="alternate"; type="application/ld+json"`,
          `<${CANONICAL_BASE}/place/${id}.json>; rel="alternate"; type="application/json"`,
        ].join(', '),
        Vary: 'Accept',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unknown place identifier' }, { status: 404 });
  }
}
