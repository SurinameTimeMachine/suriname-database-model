'use client';

import { clearAuthCache, useAuth } from '@/lib/auth';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const NAV_ITEMS = [
  { href: '/annotate', label: 'Image review' },
  { href: '/places', label: 'Places' },
  { href: '/organizations', label: 'Organizations' },
  { href: '/sources', label: 'Sources' },
  { href: '/vocabulary', label: 'Vocabulary' },
] as const;

type DomainLink = {
  label: string;
  href: string;
  isCurrent?: boolean;
};

const DOMAIN_LINKS: DomainLink[] = [
  { label: 'About', href: 'https://surinametijdmachine.org' },
  { label: 'Images', href: 'https://images.surinametijdmachine.org' },
  { label: 'Data', href: '/', isCurrent: true },
];

export default function Navigation() {
  const pathname = usePathname();
  const isAnnotationApp = pathname.startsWith('/annotate');
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, canEdit, loading: authLoading } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const err = searchParams.get('auth_error');
    if (err) {
      setAuthError(
        err === 'missing_code'
          ? 'GitHub login failed: no authorization code received.'
          : 'GitHub login failed: could not exchange token. Please try again.',
      );
      window.history.replaceState({}, '', pathname);
    }
  }, [searchParams, pathname]);

  const signIn = useCallback(() => {
    window.location.href = `/api/auth/github?returnTo=${encodeURIComponent(pathname)}`;
  }, [pathname]);

  const signOut = useCallback(() => {
    clearAuthCache();
    window.location.href = '/api/auth/logout';
  }, []);

  if (isAnnotationApp) return null;

  return (
    <>
      <header
        id="site-header"
        className="sticky top-0 z-50 border-b border-ink/10 bg-cream/95 font-sans shadow-[0_10px_28px_rgba(0,30,24,0.05)] backdrop-blur-sm"
        role="banner"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10">
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <Link
                href="/"
                aria-label="Suriname Time Machine home"
                className="flex shrink-0 items-center gap-2"
              >
                <span
                  className="h-3 w-3 -skew-x-12 bg-teal-strong"
                  aria-hidden
                />
                <span className="text-xs font-semibold uppercase tracking-[0.35em] text-ink transition-colors hover:text-teal-strong">
                  STM
                </span>
              </Link>

              <nav
                aria-label="STM domains"
                className="hidden min-w-0 items-center gap-2 whitespace-nowrap text-[11px] uppercase tracking-[0.25em] sm:flex"
              >
                {DOMAIN_LINKS.map(({ label, href, isCurrent }, index) => (
                  <div key={label} className="flex items-center gap-2">
                    {index > 0 && <span className="text-ink/20">•</span>}
                    <a
                      href={href}
                      aria-current={isCurrent ? 'page' : undefined}
                      className={
                        isCurrent
                          ? 'font-semibold text-ink'
                          : 'text-ink/60 transition-colors hover:text-ink'
                      }
                    >
                      {label}
                    </a>
                  </div>
                ))}
              </nav>
            </div>

            <nav
              aria-label="Main navigation"
              className="hidden min-w-0 flex-1 items-center justify-center gap-4 text-xs uppercase tracking-[0.2em] md:flex lg:gap-6"
            >
              {NAV_ITEMS.map(({ href, label }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`font-medium transition-colors ${
                      active ? 'text-ink' : 'text-ink/60 hover:text-ink'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden items-center gap-3 border-l border-ink/10 pl-3 sm:flex">
                <button
                  type="button"
                  aria-label="Language selector"
                  className="border-none bg-transparent text-xs font-medium uppercase tracking-[0.25em] text-ink/40 transition-colors hover:text-ink"
                >
                  EN
                </button>
                {authLoading ? (
                  <span className="text-xs text-ink/40">…</span>
                ) : user ? (
                  <>
                    <img
                      src={user.avatar_url}
                      alt={user.login}
                      className="h-5 w-5 rounded-full"
                    />
                    {canEdit && (
                      <span className="bg-teal-soft px-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-teal-strong">
                        Editor
                      </span>
                    )}
                    <button
                      onClick={signOut}
                      className="border-none bg-transparent text-[10px] uppercase tracking-[0.2em] text-ink/45 transition-colors hover:text-teal-strong"
                    >
                      Out
                    </button>
                  </>
                ) : (
                  <button
                    onClick={signIn}
                    className="site-action-secondary px-3 py-1.5 text-xs bg-transparent"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    Sign in
                  </button>
                )}
              </div>

              <button
                className="inline-flex h-8 w-8 items-center justify-center border-none bg-transparent text-ink/60 transition-colors hover:text-ink sm:hidden"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav"
                aria-label="Toggle navigation menu"
              >
                {mobileOpen ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <line x1="3" y1="3" x2="15" y2="15" />
                    <line x1="15" y1="3" x2="3" y2="15" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <line x1="2" y1="4.5" x2="16" y2="4.5" />
                    <line x1="2" y1="9" x2="16" y2="9" />
                    <line x1="2" y1="13.5" x2="16" y2="13.5" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {mobileOpen && (
          <div
            id="mobile-nav"
            className="border-t border-ink/10 bg-cream px-4 pb-4 pt-3 sm:hidden"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-ink/60">
              {DOMAIN_LINKS.map(({ label, href, isCurrent }, index) => (
                <div key={label} className="flex items-center gap-2">
                  {index > 0 && <span className="text-ink/20">•</span>}
                  <a
                    href={href}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={
                      isCurrent
                        ? 'font-semibold text-ink'
                        : 'transition-colors hover:text-ink'
                    }
                  >
                    {label}
                  </a>
                </div>
              ))}
            </div>

            <nav aria-label="Mobile navigation" className="space-y-1">
              {NAV_ITEMS.map(({ href, label }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`block px-2 py-2 text-xs uppercase tracking-[0.2em] transition-colors ${
                      active
                        ? 'font-semibold text-teal-strong'
                        : 'text-ink/70 hover:text-teal-strong'
                    }`}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? 'page' : undefined}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-4 border-t border-ink/10 pt-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  aria-label="Language selector"
                  className="border-none bg-transparent text-xs font-medium uppercase tracking-[0.25em] text-ink/40 transition-colors hover:text-ink"
                >
                  EN
                </button>
                {authLoading ? (
                  <span className="text-xs text-ink/40">…</span>
                ) : user ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={user.avatar_url}
                      alt={user.login}
                      className="h-5 w-5 rounded-full"
                    />
                    <span className="text-xs text-ink/60">
                      {user.name || user.login}
                    </span>
                    {canEdit && (
                      <span className="bg-teal-soft px-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-teal-strong">
                        Editor
                      </span>
                    )}
                    <button
                      onClick={signOut}
                      className="border-none bg-transparent text-xs uppercase tracking-[0.2em] text-ink/40 transition-colors hover:text-teal-strong"
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={signIn}
                    className="border-none bg-transparent text-xs uppercase tracking-[0.2em] text-ink/70 transition-colors hover:text-teal-strong"
                  >
                    Sign in with GitHub
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {authError && (
        <div className="flex items-center justify-center gap-2 border-b border-entity-e17/35 bg-entity-e17/15 px-4 py-1.5 text-center">
          <p className="text-xs text-ink/80">{authError}</p>
          <button
            onClick={() => setAuthError(null)}
            className="border-none bg-transparent text-xs text-teal-strong underline transition-colors hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {user && !canEdit && (
        <div className="border-b border-sand bg-sand px-4 py-1.5 text-center">
          <p className="text-xs text-ink/80">
            Signed in as <strong>{user.login}</strong> — read-only access.
          </p>
        </div>
      )}
    </>
  );
}
