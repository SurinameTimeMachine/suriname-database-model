import { NextResponse } from 'next/server';

/** Redirect to GitHub OAuth authorization page. */
export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'GITHUB_CLIENT_ID not configured' },
      { status: 500 },
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'repo',
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/auth/callback`,
  });

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params}`,
  );
}
