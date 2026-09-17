import { NextRequest, NextResponse } from 'next/server';

/** Redirect to GitHub OAuth authorization page. */
export async function GET(request: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'GITHUB_CLIENT_ID not configured' },
      { status: 500 },
    );
  }

  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/places';
  const baseUrl = (
    process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin
  ).replace(/\/+$/, '');

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'repo',
    redirect_uri: `${baseUrl}/api/auth/callback`,
    state: returnTo,
  });

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params}`,
  );
}
