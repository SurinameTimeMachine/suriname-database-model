import { NextRequest, NextResponse } from 'next/server';
const PLACE_ID = /^stm-[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  return NextResponse.redirect(
    new URL(`/data/place-records/${id}.${format}`, request.url),
  );
}
