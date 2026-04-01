'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/explore', label: 'Explore Map' },
  { href: '/places', label: 'Places' },
  { href: '/model', label: 'Data Model' },
] as const;

export default function Navigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
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

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label }) => {
              const active =
                href === '/' ? pathname === '/' : pathname.startsWith(href);
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
            const active =
              href === '/' ? pathname === '/' : pathname.startsWith(href);
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
        </div>
      )}
    </nav>
  );
}
