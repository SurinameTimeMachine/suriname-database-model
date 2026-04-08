'use client';

import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/explore', label: 'Explore Map' },
  { href: '/places', label: 'Places' },
  { href: '/sources', label: 'Sources' },
  { href: '/model', label: 'Data Model' },
  { href: '/vocabulary', label: 'Vocabulary' },
] as const;

export default function Navigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, canEdit, loading: authLoading } = useAuth();

  return (
    <>
      <nav
        className="relative bg-stm-warm-900/95 backdrop-blur-sm border-b border-stm-sepia-700/30 z-1000"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            {/* Brand */}
            <Link
              href="/"
              className="flex items-center gap-2.5 shrink-0"
              aria-label="Suriname Time Machine - Home"
            >
              <span className="text-stm-sepia-300 font-bold text-lg tracking-tight font-serif">
                Suriname Time Machine
              </span>
            </Link>

            {/* Desktop nav + auth */}
            <div className="hidden sm:flex items-center gap-1">
              {NAV_ITEMS.map(({ href, label }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-stm-sepia-700/40 text-stm-sepia-100'
                        : 'text-stm-warm-300 hover:text-stm-sepia-100 hover:bg-stm-warm-800/60'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {label}
                  </Link>
                );
              })}

              {/* Auth section */}
              <div className="ml-3 pl-3 border-l border-stm-warm-700/50 flex items-center gap-2">
                {authLoading ? (
                  <span className="text-xs text-stm-warm-500">...</span>
                ) : user ? (
                  <>
                    <img
                      src={user.avatar_url}
                      alt={user.login}
                      className="w-6 h-6 rounded-full"
                    />
                    <span className="text-xs text-stm-warm-300">
                      {user.name || user.login}
                    </span>
                    {canEdit && (
                      <span className="text-[10px] bg-stm-teal-800/60 text-stm-teal-300 px-1.5 py-0.5 rounded">
                        Editor
                      </span>
                    )}
                    <a
                      href="/api/auth/logout"
                      className="text-[10px] text-stm-warm-500 hover:text-stm-warm-300 underline"
                    >
                      Sign out
                    </a>
                  </>
                ) : (
                  <a
                    href="/api/auth/github"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-stm-warm-700/60 text-stm-warm-200 rounded hover:bg-stm-warm-700 transition-colors"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    Sign in
                  </a>
                )}
              </div>
            </div>

            {/* Mobile hamburger */}
            <button
              className="sm:hidden flex items-center justify-center w-9 h-9 text-stm-warm-300 hover:text-stm-sepia-100 hover:bg-stm-warm-800/60"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="4" y1="4" x2="16" y2="16" />
                  <line x1="16" y1="4" x2="4" y2="16" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="3" y1="5" x2="17" y2="5" />
                  <line x1="3" y1="10" x2="17" y2="10" />
                  <line x1="3" y1="15" x2="17" y2="15" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div
            id="mobile-nav"
            className="sm:hidden border-t border-stm-warm-800 bg-stm-warm-900/98 px-4 pb-3 pt-2 space-y-1"
          >
            {NAV_ITEMS.map(({ href, label }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`block px-3 py-2 text-sm font-medium ${
                    active
                      ? 'bg-stm-sepia-700/40 text-stm-sepia-100'
                      : 'text-stm-warm-300 hover:text-stm-sepia-100 hover:bg-stm-warm-800/60'
                  }`}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? 'page' : undefined}
                >
                  {label}
                </Link>
              );
            })}

            {/* Mobile auth */}
            <div className="pt-2 mt-2 border-t border-stm-warm-800">
              {user ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="w-6 h-6 rounded-full"
                  />
                  <span className="text-xs text-stm-warm-300 flex-1">
                    {user.name || user.login}
                  </span>
                  {canEdit && (
                    <span className="text-[10px] bg-stm-teal-800/60 text-stm-teal-300 px-1.5 py-0.5 rounded">
                      Editor
                    </span>
                  )}
                  <a
                    href="/api/auth/logout"
                    className="text-[10px] text-stm-warm-500 hover:text-stm-warm-300 underline"
                  >
                    Sign out
                  </a>
                </div>
              ) : (
                <a
                  href="/api/auth/github"
                  className="block px-3 py-2 text-sm text-stm-warm-300 hover:text-stm-sepia-100"
                >
                  Sign in with GitHub
                </a>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Read-only banner for logged-in users without edit rights */}
      {user && !canEdit && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center">
          <p className="text-xs text-amber-700">
            You are signed in as <strong>{user.login}</strong> but do not have
            edit permissions on this repository. Content is read-only.
          </p>
        </div>
      )}
    </>
  );
}
