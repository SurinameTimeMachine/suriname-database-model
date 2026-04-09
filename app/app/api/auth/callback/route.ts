import { exchangeCodeForToken } from '@/lib/github';
import { setSessionToken } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

const SAFE_PATH = /^\/[a-zA-Z0-9/_-]*$/;

/** Handle GitHub OAuth callback: exchange code for token, set session cookie. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state') || '/places';
  const returnTo = SAFE_PATH.test(state) ? state : '/places';

  if (!code) {
    return NextResponse.redirect(
      new URL(`${returnTo}?auth_error=missing_code`, request.nextUrl.origin),
    );
  }

  try {
    const token = await exchangeCodeForToken(code);
    await setSessionToken(token);
    return NextResponse.redirect(new URL(returnTo, request.nextUrl.origin));
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(
      new URL(`${returnTo}?auth_error=exchange_failed`, request.nextUrl.origin),
    );
  }
}
