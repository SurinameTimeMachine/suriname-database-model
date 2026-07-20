'use client';

import { buildVocabularyUrl } from '@/lib/url';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type FunctionUsage = {
  assertionId: string;
  evidenceKind: 'production' | 'recorded-function';
  sourceLabel: string;
  source: string;
  startYear?: number;
  endYear?: number;
};

type FunctionPlace = {
  id: string;
  label: string;
  recordUrl: string;
  usages: FunctionUsage[];
};

type FunctionConcept = {
  id: string;
  uri: string;
  prefLabel: { nl: string; en: string };
  sourceLabels: string[];
  evidenceKinds: Array<'production' | 'recorded-function'>;
  placeCount: number;
  assertionCount: number;
  firstYear: number | null;
  lastYear: number | null;
  places: FunctionPlace[];
};

type FunctionVocabulary = {
  scheme: {
    id: string;
    uri: string;
    prefLabel: { nl: string; en: string };
    scopeNote: { nl: string; en: string };
  };
  functions: FunctionConcept[];
};

function yearSpan(startYear?: number, endYear?: number): string {
  if (startYear == null) return 'undated';
  return endYear != null && endYear !== startYear
    ? `${startYear}–${endYear}`
    : String(startYear);
}

function evidenceLabel(kind: FunctionUsage['evidenceKind']): string {
  return kind === 'production' ? 'production/cultivation' : 'recorded function';
}

export default function VocabularyPage() {
  const params = useParams<{ typeId?: string[] }>();
  const pathParts = params.typeId ?? [];
  const pathFunctionId =
    pathParts[0] === 'place-function' ? pathParts[1] : pathParts[0];
  const [data, setData] = useState<FunctionVocabulary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(
    pathFunctionId || null,
  );

  useEffect(() => {
    void fetch('/data/place-functions.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load functions (${response.status})`);
        }
        return response.json();
      })
      .then((value: FunctionVocabulary) => setData(value))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const selectFunction = useCallback((functionId: string | null) => {
    setSelectedId(functionId);
    window.history.replaceState(
      null,
      '',
      functionId ? buildVocabularyUrl(functionId) : '/vocabulary',
    );
  }, []);

  const filteredFunctions = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLocaleLowerCase();
    if (!query) return data.functions;
    return data.functions.filter((concept) =>
      [
        concept.prefLabel.en,
        concept.prefLabel.nl,
        ...concept.sourceLabels,
      ].some((label) => label.toLocaleLowerCase().includes(query)),
    );
  }, [data, search]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <p className="text-sm text-ink/60">Loading place functions…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <p className="text-sm text-red-700">
          Failed to load the place-functions vocabulary.
        </p>
      </div>
    );
  }

  const selected = data.functions.find((concept) => concept.id === selectedId);
  const productionCount = data.functions.filter((concept) =>
    concept.evidenceKinds.includes('production'),
  ).length;
  const recordedFunctionCount = data.functions.filter((concept) =>
    concept.evidenceKinds.includes('recorded-function'),
  ).length;

  return (
    <main className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
        <header className="mb-8">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-ink/70">
            <span className="h-3 w-3 -skew-x-12 bg-teal-strong" aria-hidden />
            Controlled vocabulary
          </div>
          <h1 className="text-3xl font-semibold text-ink">
            Place functions vocabulary
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-ink/70">
            Functions are source-qualified, time-scoped classifications of a
            physical place. They describe what happened at a plantation or how
            a place was used; they are not permanent plantation types and are
            not assigned to plantation organizations.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-ink/65">
            <span className="border border-ink/10 bg-white px-3 py-1.5">
              {data.functions.length} functions
            </span>
            <span className="border border-ink/10 bg-white px-3 py-1.5">
              {productionCount} production/cultivation
            </span>
            <span className="border border-ink/10 bg-white px-3 py-1.5">
              {recordedFunctionCount} recorded uses
            </span>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div>
            <label className="mb-3 block">
              <span className="sr-only">Search functions</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search functions…"
                className="w-full border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-teal-strong"
              />
            </label>
            <div className="site-surface max-h-[65vh] overflow-y-auto">
              {filteredFunctions.map((concept) => (
                <button
                  key={`function-${concept.id}`}
                  type="button"
                  onClick={() => selectFunction(concept.id)}
                  className={`block w-full border-b border-ink/10 px-4 py-3 text-left transition-colors last:border-b-0 ${
                    selectedId === concept.id
                      ? 'border-l-2 border-l-teal-strong bg-stm-sepia-50'
                      : 'hover:bg-ink/[0.03]'
                  }`}
                >
                  <span className="block text-sm font-semibold text-ink">
                    {concept.prefLabel.en}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink/55">
                    {concept.prefLabel.nl} · {concept.placeCount}{' '}
                    {concept.placeCount === 1 ? 'place' : 'places'}
                    {concept.firstYear != null
                      ? ` · ${yearSpan(concept.firstYear, concept.lastYear ?? undefined)}`
                      : ''}
                  </span>
                </button>
              ))}
              {filteredFunctions.length === 0 && (
                <p className="p-5 text-sm text-ink/55">No functions match.</p>
              )}
            </div>
          </div>

          <div>
            {selected ? (
              <article className="site-surface p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.16em]">
                      <span className="bg-green-100 px-2 py-1 text-green-800">
                        crm:E55 Type
                      </span>
                      <span className="bg-stm-sepia-100 px-2 py-1 text-stm-sepia-800">
                        skos:Concept
                      </span>
                    </div>
                    <h2 className="text-2xl font-semibold text-ink">
                      {selected.prefLabel.en}
                    </h2>
                    <p className="mt-1 text-sm text-ink/60">
                      {selected.prefLabel.nl}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-ink/45">
                    {selected.id}
                  </span>
                </div>

                <dl className="mt-6 grid gap-4 border-y border-ink/10 py-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink/45">
                      Connected places
                    </dt>
                    <dd className="mt-1 font-semibold">{selected.placeCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink/45">
                      Assignments
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {selected.assertionCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink/45">
                      Attested period
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {selected.firstYear == null
                        ? 'undated'
                        : yearSpan(
                            selected.firstYear,
                            selected.lastYear ?? undefined,
                          )}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">
                    Source terms
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.sourceLabels.map((label) => (
                      <span
                        key={`source-label-${label}`}
                        className="border border-ink/10 bg-ink/[0.03] px-2 py-1 text-xs"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-7">
                  <h3 className="text-lg font-semibold text-ink">
                    Plantations with this function
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-ink/55">
                    Each period is an attested source span. Missing years do not
                    prove that the function stopped.
                  </p>
                  <div className="mt-3 divide-y divide-ink/10 border-y border-ink/10">
                    {selected.places.map((place) => (
                      <div
                        key={`function-place-${place.id}`}
                        className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,1fr)]"
                      >
                        <div>
                          <Link
                            href={place.recordUrl}
                            className="font-semibold text-teal-strong hover:underline"
                          >
                            {place.label}
                          </Link>
                          <p className="font-mono text-[10px] text-ink/40">
                            {place.id}
                          </p>
                        </div>
                        <div className="space-y-1">
                          {place.usages.map((usage) => (
                            <p
                              key={`${place.id}-${usage.assertionId}`}
                              className="text-xs text-ink/65"
                            >
                              <span className="font-mono text-ink">
                                {yearSpan(usage.startYear, usage.endYear)}
                              </span>{' '}
                              · {evidenceLabel(usage.evidenceKind)} ·{' '}
                              {usage.source}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 break-all border border-ink/10 bg-ink/[0.025] p-3 font-mono text-xs text-ink/55">
                  Canonical identifier:{' '}
                  <a className="hover:underline" href={selected.uri}>
                    {selected.uri}
                  </a>
                </div>
              </article>
            ) : (
              <div className="site-surface p-10 text-center text-sm text-ink/55">
                Select a function to see its vocabulary term, time span, and
                connected plantations.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
