export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center bg-background px-4">
      <div className="border border-slate-200 bg-white p-8 text-center shadow-[0_15px_35px_rgba(0,30,24,0.08)]">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.35em] text-ink/60">
          Not Found
        </div>
        <h1 className="mb-3 text-4xl font-semibold text-ink">404</h1>
        <p className="text-sm text-ink/65">Page not found</p>
      </div>
    </div>
  );
}
