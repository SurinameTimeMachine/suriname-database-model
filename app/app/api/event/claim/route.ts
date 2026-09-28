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
    const task = result.task;
    return NextResponse.json({
      ...result,
      // Participant IDs are session credentials; never expose other reviewers.
      task: task ? {
        taskId: task.taskId,
        detailId: task.detailId,
        mediaId: task.mediaId,
        title: task.title,
        description: task.description,
        yearRaw: task.yearRaw,
        inventoryNumber: task.inventoryNumber,
        sourceUrl: task.sourceUrl,
        lowResUrl: task.lowResUrl,
        currentClaim: task.currentClaim ? { claimId: task.currentClaim.claimId } : null,
      } : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to claim task' },
      { status: 400 },
    );
  }
}
