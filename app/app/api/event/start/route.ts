import { NextRequest, NextResponse } from 'next/server';
import { startParticipant } from '@/lib/event-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const nickname = String(body?.nickname || '').trim();
    if (!nickname) {
      return NextResponse.json({ error: 'nickname is required' }, { status: 400 });
    }
    const result = await startParticipant(nickname.slice(0, 40));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start participant session' },
      { status: 500 },
    );
  }
}
