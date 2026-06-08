export default function SiteFooter() {
  return (
    <footer id="site-footer" className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-ink/65">
          <span className="font-medium text-ink/85">Suriname Time Machine</span>
          <span className="text-ink/25">•</span>
          <span>2026</span>
          <span className="text-ink/25">•</span>
          <span>Project lead: Thunnis van Oort</span>
          <span className="text-ink/25">•</span>
          <span>Funder: Stichting Pica</span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-ink/55">
          <a href="/#partners" className="transition hover:text-teal-strong">
            Partners
          </a>
          <span className="text-ink/25">•</span>
          <span>Data sources (coming soon)</span>
        </div>
      </div>
    </footer>
  );
}
