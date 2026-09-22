import { NextRequest, NextResponse } from 'next/server';
import { claimTask } from '@/lib/event-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const participantId = String(body?.participantId || '').trim();
    const excludeTaskId = String(body?.excludeTaskId || '').trim();
    if (!participantId) {
      return NextResponse.json({ error: 'participantId is required' }, { status: 400 });
    }
    const result = await claimTask(participantId, excludeTaskId || undefined);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to claim task' },
      { status: 400 },
    );
  }
}
