import { readFile } from 'fs/promises';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

const PLACE_ID = /^stm-[a-z0-9]+(?:-[a-z0-9]+)*$/;
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

  const format = request.nextUrl.searchParams.get('format') === 'json'
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
    return NextResponse.redirect(
      new URL(`/data/place-records/${mergedInto}.${format}`, request.url),
      308,
    );
  }

  return NextResponse.redirect(
    new URL(`/data/place-records/${id}.${format}`, request.url),
  );
}
