import { NextResponse } from 'next/server';
import { getPlaceOptions } from '@/lib/event-store';

export async function GET() {
  try {
    const places = await getPlaceOptions();
    return NextResponse.json({ places });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load place options' },
      { status: 500 },
    );
  }
}
