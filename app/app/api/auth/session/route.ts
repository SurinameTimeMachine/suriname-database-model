import { getGitHubUser, hasRepoAccess } from '@/lib/github';
import { getSessionToken } from '@/lib/session';
import { NextResponse } from 'next/server';

/** Return the current authenticated user (if any). */
export async function GET() {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ user: null, canEdit: false });
  }

  try {
    const [user, canEdit] = await Promise.all([
      getGitHubUser(token),
      hasRepoAccess(token),
    ]);
    return NextResponse.json({ user, canEdit });
  } catch {
    return NextResponse.json({ user: null, canEdit: false });
  }
}
