import { NextResponse } from 'next/server';
import { getEventStatus } from '@/lib/event-store';

export async function GET() {
  try {
    const status = await getEventStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 },
    );
  }
}
