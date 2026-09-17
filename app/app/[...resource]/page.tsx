import { canonicalBase, loadResource, resourcePath } from '@/lib/lod-resource';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ resource: string[] }>;
}): Promise<Metadata> {
  const { resource } = await params;
  const path = resourcePath(resource);
  if (!path) return {};
  const canonical = `${canonicalBase}${path}`;
  return {
    title: `${resource.at(-1)} | Suriname Time Machine`,
    alternates: {
      canonical,
      types: {
        'application/ld+json': `${canonical}.jsonld`,
        'application/json': `${canonical}.json`,
      },
    },
  };
}

export default async function LinkedDataResourcePage({
  params,
}: {
  params: Promise<{ resource: string[] }>;
}) {
  const { resource: parts } = await params;
  const resource = await loadResource(parts);
  if (!resource) notFound();

  const entries = Object.entries(resource.entity).filter(([key]) => key !== '@id');
  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-10 text-ink sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-strong">
        Linked-data resource
      </p>
      <h1 className="mt-2 break-all font-mono text-xl font-semibold">
        {resource.uri}
      </h1>
      <nav className="mt-5 flex gap-2 text-sm">
        <a className="border border-ink/20 px-3 py-2" href={`${resource.uri}.jsonld`}>
          JSON-LD
        </a>
        <a className="border border-ink/20 px-3 py-2" href={`${resource.uri}.json`}>
          JSON
        </a>
      </nav>
      <dl className="mt-8 divide-y divide-ink/10 border-y border-ink/10 bg-white/60">
        {entries.map(([property, value]) => (
          <div key={`property-${property}`} className="grid gap-2 py-3 sm:grid-cols-[15rem_1fr]">
            <dt className="break-all font-mono text-xs text-ink/55">{property}</dt>
            <dd className="min-w-0 space-y-1 text-sm">
              {values(value).map((item) =>
                typeof item === 'string' && /^https?:\/\//.test(item) ? (
                  <a
                    key={`${property}-${item}`}
                    className="block break-all underline decoration-teal-strong"
                    href={item}
                  >
                    {item}
                  </a>
                ) : (
                  <pre
                    key={`${property}-${JSON.stringify(item)}`}
                    className="whitespace-pre-wrap break-all font-mono text-xs"
                  >
                    {typeof item === 'object'
                      ? JSON.stringify(item, null, 2)
                      : `${item}`}
                  </pre>
                ),
              )}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
