import { readFile } from 'fs/promises';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { join } from 'path';
import type { Metadata } from 'next';

const CANONICAL_BASE = 'https://data.surinametijdmachine.org';
const GAZETTEER_PATH = join(
  process.cwd(),
  '..',
  'data',
  'places-gazetteer.jsonld',
);
const PLACE_RECORDS_DIR = join(
  process.cwd(),
  'public',
  'data',
  'place-records',
);
const PLACE_ID = /^stm-[a-z0-9]+(?:-[a-z0-9]+)*$/;

type PlaceProjection = {
  id: string;
  label: string;
  type: string;
  recordUrl: string;
  jsonldUrl: string;
  jsonUrl: string;
  feature: { id: string; crmClass: string } | null;
  location: {
    id: string;
    lat: number | null;
    lng: number | null;
    wkt: string | null;
  };
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
  functionAssertions: Array<{
    id: string;
    functionId: string;
    functionUri: string;
    label: string;
    sourceLabel: string;
    evidenceKinds: Array<'production' | 'recorded-function'>;
    source: string;
    sourceRows: string[];
    certainty: 'certain' | 'probable' | 'uncertain';
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

type GazetteerDocument = {
  '@graph'?: Array<{ id?: string; mergedInto?: string }>;
};

async function readMergedInto(id: string): Promise<string | undefined> {
  try {
    const gazetteer = JSON.parse(
      await readFile(GAZETTEER_PATH, 'utf-8'),
    ) as GazetteerDocument;
    const entry = gazetteer['@graph']?.find((candidate) => candidate.id === id);
    return typeof entry?.mergedInto === 'string' ? entry.mergedInto : undefined;
  } catch {
    return undefined;
  }
}

async function loadPlaceProjection(id: string): Promise<PlaceProjection | null> {
  try {
    return JSON.parse(
      await readFile(join(PLACE_RECORDS_DIR, `${id}.json`), 'utf-8'),
    ) as PlaceProjection;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!PLACE_ID.test(id)) return {};
  const canonical = `${CANONICAL_BASE}/place/${id}`;
  return {
    alternates: {
      canonical,
      types: {
        'application/ld+json': `${canonical}.jsonld`,
        'application/json': `${canonical}.json`,
      },
    },
  };
}

export default async function PlaceRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!PLACE_ID.test(id)) notFound();

  const mergedInto = await readMergedInto(id);
  if (typeof mergedInto === 'string' && PLACE_ID.test(mergedInto)) {
    redirect(`/place/${mergedInto}`);
  }

  let place = await loadPlaceProjection(id);
  if (!place) notFound();

  place = {
    ...place,
    recordUrl: `/place/${id}`,
    jsonldUrl: `/place/${id}.jsonld`,
    jsonUrl: `/place/${id}.json`,
    names: place.names ?? [],
    sources: place.sources ?? [],
    statusAssertions: place.statusAssertions ?? [],
    productAssertions: place.productAssertions ?? [],
    functionAssertions: place.functionAssertions ?? [],
    locationAssertions: place.locationAssertions ?? [],
    diklandRefs: place.diklandRefs ?? [],
  };
  const canonicalUri = `${CANONICAL_BASE}/place/${id}`;

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-ink sm:px-6 lg:px-10">
      <article id="record" className="mx-auto max-w-4xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-teal-strong">
          Authority record · {place.id}
        </p>
        <h1 className="text-4xl font-semibold">{place.label}</h1>
        <p className="mt-2 text-sm text-ink/65">{place.type}</p>
        <nav className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link className="border border-ink/20 px-3 py-2 hover:border-teal-strong" href={`/places?place=${id}`}>
            Edit in Gazetteer
          </Link>
          <a className="border border-ink/20 px-3 py-2 hover:border-teal-strong" href={place.jsonldUrl}>
            Complete JSON-LD
          </a>
          <a
            className="border border-ink/20 px-3 py-2 hover:border-teal-strong"
            href={`${place.jsonldUrl}?profile=globalise`}
          >
            Compact JSON-LD
          </a>
          <a className="border border-ink/20 px-3 py-2 hover:border-teal-strong" href={place.jsonUrl}>
            JSON
          </a>
        </nav>

        <section className="mt-8 border border-ink/10 bg-white/70 p-4 text-sm">
          <h2 className="text-base font-semibold">Identifiers</h2>
          <dl className="mt-3 grid gap-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-ink/50">Canonical URI</dt>
              <dd className="mt-1 break-all font-mono text-xs">
                <a className="underline decoration-teal-strong" href={canonicalUri}>{canonicalUri}</a>
              </dd>
            </div>
            {place.feature && (
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink/50">Feature URI</dt>
                <dd className="mt-1 break-all font-mono text-xs">
                  <a className="underline decoration-teal-strong" href={place.feature.id}>{place.feature.id}</a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-ink/50">Location URI</dt>
              <dd className="mt-1 break-all font-mono text-xs">
                <a className="underline decoration-teal-strong" href={place.location.id}>{place.location.id}</a>
              </dd>
            </div>
          </dl>
        </section>

        {place.feature && (
          <section id="feature" className="mt-10 border-t border-ink/10 pt-6">
            <h2 className="text-xl font-semibold">Feature</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div>
                <dt className="text-ink/55">CRM class</dt>
                <dd>{place.feature.crmClass}</dd>
              </div>
              <div>
                <dt className="text-ink/55">URI</dt>
                <dd className="break-all font-mono text-xs">{place.feature.id}</dd>
              </div>
            </dl>
          </section>
        )}

        <section id="location" className="mt-10 border-t border-ink/10 pt-6">
          <h2 className="text-xl font-semibold">Location</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div>
              <dt className="text-ink/55">URI</dt>
              <dd className="break-all font-mono text-xs">{place.location.id}</dd>
            </div>
            {place.location.lat != null && place.location.lng != null && (
              <div>
                <dt className="text-ink/55">Centroid</dt>
                <dd>{place.location.lat}, {place.location.lng}</dd>
              </div>
            )}
            {place.location.wkt && (
              <div>
                <dt className="text-ink/55">WKT</dt>
                <dd className="break-all font-mono text-xs">{place.location.wkt}</dd>
              </div>
            )}
          </dl>
        </section>

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

        {place.functionAssertions.length > 0 && (
          <section className="mt-10 border-t border-ink/10 pt-6">
            <h2 className="text-xl font-semibold">Place functions</h2>
            <p className="mt-2 text-sm text-ink/65">
              Source-qualified functions of this physical place. A date range
              records when the function is attested, not necessarily its full
              duration.
            </p>
            <ul className="mt-3 space-y-3 text-sm">
              {place.functionAssertions.map((assertion) => (
                <li
                  key={assertion.id}
                  className="border-l-2 border-teal-strong pl-3"
                >
                  <Link
                    className="font-semibold underline decoration-teal-strong"
                    href={`/vocabulary/place-function/${assertion.functionId}`}
                  >
                    {assertion.label}
                  </Link>{' '}
                  <span className="text-ink/65">
                    {assertion.startYear ?? 'undated'}
                    {assertion.endYear &&
                    assertion.endYear !== assertion.startYear
                      ? `–${assertion.endYear}`
                      : ''}
                    {assertion.source ? ` · ${assertion.source}` : ''}
                    {` · ${assertion.certainty}`}
                  </span>
                  <p className="mt-1 text-xs text-ink/55">
                    Source term: {assertion.sourceLabel}
                    {assertion.sourceRows.length > 0
                      ? ` · ${assertion.sourceRows.length} supporting source ${assertion.sourceRows.length === 1 ? 'row' : 'rows'}`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

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
