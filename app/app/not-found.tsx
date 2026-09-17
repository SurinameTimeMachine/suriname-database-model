export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="site-panel p-8 text-center">
        <div className="site-kicker mb-2 justify-center">
          Not Found
        </div>
        <h1 className="mb-3 text-4xl font-semibold text-ink">404</h1>
        <p className="text-sm text-ink/65">Page not found</p>
      </div>
    </div>
  );
}
