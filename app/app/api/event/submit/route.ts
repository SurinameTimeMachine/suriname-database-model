import { NextRequest, NextResponse } from 'next/server';
import { submitTask } from '@/lib/event-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const participantId = String(body?.participantId || '').trim();
    const taskId = String(body?.taskId || '').trim();
    const claimId = String(body?.claimId || '').trim();
    const payload = body?.payload;

    if (!participantId || !taskId || !claimId || !payload) {
      return NextResponse.json(
        { error: 'participantId, taskId, claimId, and payload are required' },
        { status: 400 },
      );
    }

    const result = await submitTask(participantId, taskId, claimId, payload);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit task' },
      { status: 400 },
    );
  }
}
