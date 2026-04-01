/**
 * Simple cookie-based session helpers for GitHub OAuth tokens.
 * The token is stored in an HttpOnly cookie (not encrypted for simplicity;
 * in production, use an encrypted session library).
 */
import { cookies } from 'next/headers';

const COOKIE_NAME = 'gh_session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function setSessionToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
