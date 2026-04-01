import { clearSession } from '@/lib/session';
import { NextResponse } from 'next/server';

/** Clear the session cookie and redirect to /places. */
export async function GET() {
  await clearSession();
  return NextResponse.redirect(
    new URL(
      '/places',
      process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    ),
  );
}
