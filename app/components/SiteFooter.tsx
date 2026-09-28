'use client';

import { usePathname } from 'next/navigation';

export default function SiteFooter() {
  const pathname = usePathname();
  const isAnnotationApp = pathname.startsWith('/annotate') || pathname === '/event';

  return (
    <footer
      id="site-footer"
      className={`${isAnnotationApp ? 'hidden md:block ' : ''}shrink-0 border-t border-ink/10 bg-cream`}
    >
      <FooterContent />
    </footer>
  );
}

export function FooterContent() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-ink/65">
        <span className="font-medium text-ink/85">Suriname Time Machine</span>
        <span className="text-ink/25">•</span>
        <span>2026</span>
        <span className="text-ink/25">•</span>
        <span>Development &amp; Design: Jona Schlegel</span>
        <span className="text-ink/25">•</span>
        <span>Project lead: Thunnis van Oort</span>
        <span className="text-ink/25">•</span>
        <span>Funder: Stichting Pica</span>
        <span className="text-ink/25">•</span>
        <span>Huygens Institute</span>
        <span className="text-ink/25">•</span>
        <a
          href="https://surinametijdmachine.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="transition hover:text-teal-strong"
        >
          About
        </a>
      </div>

      <p className="mt-1.5 text-center text-[11px] text-ink/45">
        Development Preview: This platform is actively under development for
        research and testing. Historical record linkages are continuously
        being refined and may contain errors or incomplete data.
      </p>
    </div>
  );
}
