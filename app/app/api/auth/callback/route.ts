import { exchangeCodeForToken } from '@/lib/github';
import { setSessionToken } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

/** Handle GitHub OAuth callback: exchange code for token, set session cookie. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  try {
    const token = await exchangeCodeForToken(code);
    await setSessionToken(token);
    return NextResponse.redirect(new URL('/places', request.nextUrl.origin));
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(
      new URL('/places?auth_error=1', request.nextUrl.origin),
    );
  }
}
