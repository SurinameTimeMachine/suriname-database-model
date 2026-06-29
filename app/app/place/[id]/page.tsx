import { readFile } from 'fs/promises';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { join } from 'path';

const GAZETTEER_PATH = join(
  process.cwd(),
  '..',
  'data',
  'places-gazetteer.jsonld',
);
const PLACE_ID = /^stm-[a-z0-9]+(?:-[a-z0-9]+)*$/;

type PlaceProjection = {
  id: string;
  label: string;
  type: string;
  jsonldUrl: string;
  jsonUrl: string;
  names: Array<{ text?: string; language?: string; type?: string }>;
  sources: string[];
  statusAssertions: Array<{
    id?: string;
    status?: string;
    source?: string;
    startYear?: number;
    endYear?: number;
    note?: string | null;
  }>;
  productAssertions: Array<{
    id?: string;
    value?: string;
    source?: string;
    startYear?: number;
    endYear?: number;
  }>;
  locationAssertions: Array<{
    id?: string;
    standardized?: string | null;
    original?: string | null;
    source?: string;
    startYear?: number;
    endYear?: number;
    note?: string | null;
    sourceRow?: string;
  }>;
  diklandRefs: Array<{
    folderPath?: string;
    driveUrl?: string;
    author?: string | null;
    year?: string | null;
  }>;
};

type GazetteerDocument = { '@graph'?: PlaceProjection[] };

export default async function PlaceRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!PLACE_ID.test(id)) notFound();

  let entry: PlaceProjection | undefined;
  try {
    const gazetteer = JSON.parse(
      await readFile(GAZETTEER_PATH, 'utf-8'),
    ) as GazetteerDocument;
    entry = gazetteer['@graph']?.find(
      (candidate) => candidate.id === id,
    );
  } catch {
    notFound();
  }

  if (!entry || (entry as Record<string, unknown>).deprecated) notFound();
  const mergedInto = (entry as Record<string, unknown>).mergedInto;
  if (typeof mergedInto === 'string' && PLACE_ID.test(mergedInto)) {
    redirect(`/place/${mergedInto}`);
  }

  const place: PlaceProjection = {
    ...entry,
    jsonldUrl: `/place/${id}.jsonld`,
    jsonUrl: `/place/${id}.json`,
    names: entry.names ?? [],
    sources: entry.sources ?? [],
    statusAssertions: entry.statusAssertions ?? [],
    productAssertions: entry.productAssertions ?? [],
    locationAssertions: entry.locationAssertions ?? [],
    diklandRefs: entry.diklandRefs ?? [],
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-ink sm:px-6 lg:px-10">
      <article className="mx-auto max-w-4xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-teal-strong">
          Authority record · {place.id}
        </p>
        <h1 className="text-4xl font-semibold">{place.label}</h1>
        <p className="mt-2 text-sm text-ink/65">{place.type}</p>
        <nav className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link className="border border-ink/20 px-3 py-2 hover:border-teal-strong" href="/places">
            Gazetteer
          </Link>
          <a className="border border-ink/20 px-3 py-2 hover:border-teal-strong" href={place.jsonldUrl}>
            JSON-LD
          </a>
          <a className="border border-ink/20 px-3 py-2 hover:border-teal-strong" href={place.jsonUrl}>
            JSON
          </a>
        </nav>

        <section className="mt-10 border-t border-ink/10 pt-6">
          <h2 className="text-xl font-semibold">Names</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {place.names.map((name, index) => (
              <li key={`${name.text}-${index}`}>
                {name.text} <span className="text-ink/55">({name.type}, {name.language})</span>
              </li>
            ))}
          </ul>
        </section>

        {place.locationAssertions.length > 0 && (
          <section className="mt-10 border-t border-ink/10 pt-6">
            <h2 className="text-xl font-semibold">Location evidence</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {place.locationAssertions.map((assertion, index) => (
                <li key={assertion.id ?? index} className="border-l-2 border-teal-strong pl-3">
                  <strong>{assertion.standardized ?? assertion.original}</strong>
                  <span className="text-ink/65">
                    {' '}
                    {assertion.startYear}
                    {assertion.endYear && assertion.endYear !== assertion.startYear ? `–${assertion.endYear}` : ''}
                    {assertion.source ? ` · ${assertion.source}` : ''}
                  </span>
                  {assertion.original && assertion.original !== assertion.standardized && (
                    <p className="mt-1 text-ink/65">Source address: {assertion.original}</p>
                  )}
                  {assertion.note && <p className="mt-1 text-ink/65">{assertion.note}</p>}
                  {assertion.sourceRow && <p className="mt-1 font-mono text-xs text-ink/45">{assertion.sourceRow}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10 border-t border-ink/10 pt-6">
          <h2 className="text-xl font-semibold">Operational evidence</h2>
          {place.statusAssertions.length === 0 ? (
            <p className="mt-3 text-sm text-ink/65">No operational status assertions are recorded.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {place.statusAssertions.map((assertion, index) => (
                <li key={assertion.id ?? index} className="border-l-2 border-teal-strong pl-3">
                  <strong>{assertion.status}</strong>{' '}
                  <span className="text-ink/65">
                    {assertion.startYear}
                    {assertion.endYear && assertion.endYear !== assertion.startYear ? `–${assertion.endYear}` : ''}
                    {assertion.source ? ` · ${assertion.source}` : ''}
                  </span>
                  {assertion.note && <p className="mt-1 text-ink/65">{assertion.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10 border-t border-ink/10 pt-6">
          <h2 className="text-xl font-semibold">Cultivation evidence</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {place.productAssertions.map((assertion, index) => (
              <li key={assertion.id ?? index}>
                {assertion.value} <span className="text-ink/65">{assertion.startYear}{assertion.endYear && assertion.endYear !== assertion.startYear ? `–${assertion.endYear}` : ''}{assertion.source ? ` · ${assertion.source}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>

        {place.diklandRefs.length > 0 && (
          <section className="mt-10 border-t border-ink/10 pt-6">
            <h2 className="text-xl font-semibold">Dikland collection</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {place.diklandRefs.map((ref, index) => (
                <li key={`${ref.folderPath}-${index}`}>
                  {ref.driveUrl ? <a className="underline decoration-teal-strong" href={ref.driveUrl}>{ref.folderPath ?? 'Open source'}</a> : ref.folderPath}
                  <span className="block text-ink/65">{[ref.author, ref.year].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}
