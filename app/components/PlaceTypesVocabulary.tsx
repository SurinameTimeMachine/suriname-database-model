'use client';

import ThesaurusEditor from '@/components/ThesaurusEditor';
import { useAuth } from '@/lib/auth';
import type {
  LangArrayMap,
  LangMap,
  PlaceTypeConcept,
  ThesaurusScheme,
} from '@/lib/thesaurus';
import { langEn, parseThesaurus } from '@/lib/thesaurus';
import {
  buildPlaceFunctionVocabularyUrl,
  buildVocabularyUrl,
} from '@/lib/url';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type PlaceRecordIndexEntry = {
  id: string;
  label: string;
  type: string;
};

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
  functions: FunctionConcept[];
};

type PlaceFunctionConnection = {
  concept: FunctionConcept;
  usages: FunctionUsage[];
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load ${url} (${response.status})`);
  }
  return (await response.json()) as T;
}

export default function PlaceTypesVocabulary() {
  const { canEdit } = useAuth();
  const params = useParams<{ typeId?: string[] }>();
  const pathParts = params.typeId ?? [];
  const pathFunctionId =
    pathParts[0] === 'place-function' ? pathParts[1] : null;
  const pathTypeId =
    pathParts[0] === 'place-function' ? 'plantation' : pathParts[0] || 'plantation';
  const [scheme, setScheme] = useState<ThesaurusScheme | null>(null);
  const [concepts, setConcepts] = useState<PlaceTypeConcept[]>([]);
  const [placeRecords, setPlaceRecords] = useState<PlaceRecordIndexEntry[]>([]);
  const [functionVocabulary, setFunctionVocabulary] =
    useState<FunctionVocabulary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedConcept, setSelectedConcept] = useState(pathTypeId);
  const [selectedFunctionId, setSelectedFunctionId] = useState<string | null>(
    pathFunctionId,
  );
  const [placeSearch, setPlaceSearch] = useState('');
  const [visiblePlaceCount, setVisiblePlaceCount] = useState(100);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetchJson<unknown>('/data/place-types-thesaurus.jsonld'),
      fetchJson<PlaceRecordIndexEntry[]>('/data/place-records/index.json'),
      fetchJson<FunctionVocabulary>('/data/place-functions.json'),
    ])
      .then(([thesaurusData, recordIndex, functions]) => {
        const parsed = parseThesaurus(thesaurusData);
        setScheme(parsed.scheme);
        setConcepts(parsed.concepts);
        setPlaceRecords(recordIndex);
        setFunctionVocabulary(functions);
      })
      .catch(() => setScheme(null))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectConcept = useCallback((typeId: string) => {
    setSelectedConcept(typeId);
    setSelectedFunctionId(null);
    setPlaceSearch('');
    setVisiblePlaceCount(100);
    window.history.replaceState(
      null,
      '',
      buildVocabularyUrl(typeId),
    );
  }, []);

  const handleSelectFunction = useCallback(
    (functionId: string) => {
      const functionConcept = functionVocabulary?.functions.find(
        (concept) => concept.id === functionId,
      );
      const connectedType = functionConcept?.places
        .map((place) =>
          placeRecords.find((record) => record.id === place.id)?.type,
        )
        .find((type): type is string => Boolean(type));
      if (connectedType) setSelectedConcept(connectedType);
      setSelectedFunctionId(functionId);
      setPlaceSearch('');
      setVisiblePlaceCount(100);
      window.history.replaceState(
        null,
        '',
        buildPlaceFunctionVocabularyUrl(functionId),
      );
    },
    [functionVocabulary, placeRecords],
  );

  const placeTypeById = useMemo(
    () => new Map(placeRecords.map((record) => [record.id, record.type])),
    [placeRecords],
  );
  const placeCountsByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of placeRecords) {
      counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
    }
    return counts;
  }, [placeRecords]);
  const functionsByPlace = useMemo(() => {
    const byPlace = new Map<string, PlaceFunctionConnection[]>();
    for (const concept of functionVocabulary?.functions ?? []) {
      for (const place of concept.places) {
        const connections = byPlace.get(place.id) ?? [];
        connections.push({ concept, usages: place.usages });
        byPlace.set(place.id, connections);
      }
    }
    return byPlace;
  }, [functionVocabulary]);
  const selectedFunction = functionVocabulary?.functions.find(
    (concept) => concept.id === selectedFunctionId,
  );
  const relatedFunctions = useMemo(
    () =>
      (functionVocabulary?.functions ?? []).filter((concept) =>
        concept.places.some(
          (place) => placeTypeById.get(place.id) === selectedConcept,
        ),
      ),
    [functionVocabulary, placeTypeById, selectedConcept],
  );
  const filteredPlaces = useMemo(() => {
    const functionPlaceIds = selectedFunction
      ? new Set(selectedFunction.places.map((place) => place.id))
      : null;
    const query = placeSearch.trim().toLocaleLowerCase();
    return placeRecords
      .filter(
        (record) =>
          record.type === selectedConcept &&
          (!functionPlaceIds || functionPlaceIds.has(record.id)) &&
          (!query ||
            record.label.toLocaleLowerCase().includes(query) ||
            record.id.toLocaleLowerCase().includes(query)),
      )
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [placeRecords, placeSearch, selectedConcept, selectedFunction]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-4">
        <section
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="w-full max-w-3xl border border-ink/10 bg-white p-5 shadow-[0_15px_35px_rgba(0,30,24,0.08)]"
        >
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-ink/60">
            <span className="h-2.5 w-2.5 -skew-x-12 bg-teal-strong animate-pulse" />
            Loading place types
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-24 animate-pulse bg-ink/5" />
            <div className="h-24 animate-pulse bg-ink/5" />
          </div>
        </section>
      </div>
    );
  }

  if (!scheme) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-4">
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load the place-type thesaurus.
        </div>
      </div>
    );
  }

  const selected = selectedConcept
    ? concepts.find((concept) => concept.typeId === selectedConcept)
    : null;
  const hierarchyGroups = [
    {
      label: 'Human-Made Features',
      broader: 'stm:vocabulary/place-type/human-made',
      crmClass: 'E25',
    },
    {
      label: 'Natural Features',
      broader: 'stm:vocabulary/place-type/natural',
      crmClass: 'E26',
    },
    {
      label: 'Administrative Divisions',
      broader: 'stm:vocabulary/place-type/administrative',
      crmClass: 'E53',
    },
  ];
  const getDirectChildren = (broaderUri: string) =>
    concepts.filter((concept) => concept.broader === broaderUri);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-ink/70">
              <span className="inline-flex h-3 w-3 -skew-x-12 bg-teal-strong" />
              Controlled vocabulary
            </div>
            <h1 className="mb-2 text-3xl font-semibold text-ink">
              Place vocabulary
            </h1>
            <p className="text-sm leading-6 text-ink/70">
              Select one place type to see its definition, related functions,
              and all classified places. Functions are dated source evidence;
              they do not replace the structural type hierarchy.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowEditor(true)}
              className="border border-stm-sepia-600 bg-stm-sepia-600 px-4 py-2 text-sm font-medium text-white hover:bg-stm-sepia-700"
            >
              Edit vocabulary
            </button>
          )}
        </header>

        <div className="site-surface mb-6 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-stm-sepia-100 px-2 py-0.5 text-xs font-medium text-stm-sepia-700">
              ConceptScheme
            </span>
            <h2 className="font-serif text-base font-semibold text-stm-warm-900">
              {langEn(scheme.prefLabel)}
            </h2>
            <span className="ml-auto font-mono text-[10px] text-stm-warm-400">
              {shortUri(scheme.id)}
            </span>
          </div>
          {langEn(scheme.scopeNote) && (
            <p className="mt-2 text-xs leading-5 text-stm-warm-600">
              {langEn(scheme.scopeNote)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <aside>
            <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-stm-warm-500">
              Type hierarchy
            </h3>
            <div className="site-surface max-h-[75vh] overflow-y-auto">
              {hierarchyGroups.map((group) => (
                <div key={`type-group-${group.broader}`}>
                  <div className="border-b border-stm-warm-100 bg-stm-warm-50/50 px-4 py-3">
                    <span className="text-sm font-medium text-stm-warm-800">
                      {group.label}
                    </span>
                    <span className="ml-2 font-mono text-[10px] text-stm-warm-400">
                      {group.crmClass}
                    </span>
                  </div>
                  {getDirectChildren(group.broader).map((child) => {
                    const subChildren = getDirectChildren(child.id);
                    return (
                      <div key={`type-${child.typeId}`}>
                        <ConceptButton
                          concept={child}
                          selected={selectedConcept === child.typeId}
                          onSelect={handleSelectConcept}
                          childCount={subChildren.length}
                          placeCount={placeCountsByType.get(child.typeId) ?? 0}
                        />
                        {subChildren.map((sub) => (
                          <ConceptButton
                            key={`type-${sub.typeId}`}
                            concept={sub}
                            selected={selectedConcept === sub.typeId}
                            onSelect={handleSelectConcept}
                            placeCount={placeCountsByType.get(sub.typeId) ?? 0}
                            nested
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>

          <main className="min-w-0 space-y-5">
            {selected ? (
              <>
                <ConceptDetails
                  selected={selected}
                  concepts={concepts}
                  onSelect={handleSelectConcept}
                />
                {relatedFunctions.length > 0 && (
                  <RelatedFunctions
                    functions={relatedFunctions}
                    selectedFunctionId={selectedFunctionId}
                    onSelect={handleSelectFunction}
                  />
                )}
                {selectedFunction && (
                  <SelectedFunctionSummary functionConcept={selectedFunction} />
                )}
                <PlacesForType
                  typeLabel={langEn(selected.prefLabel)}
                  places={filteredPlaces.slice(0, visiblePlaceCount)}
                  totalCount={filteredPlaces.length}
                  search={placeSearch}
                  onSearch={(value) => {
                    setPlaceSearch(value);
                    setVisiblePlaceCount(100);
                  }}
                  functionsByPlace={functionsByPlace}
                  selectedFunctionId={selectedFunctionId}
                  onSelectFunction={handleSelectFunction}
                  onLoadMore={() =>
                    setVisiblePlaceCount((count) => count + 100)
                  }
                />
              </>
            ) : (
              <div className="site-surface p-8 text-center text-sm text-stm-warm-400">
                Select a type in the hierarchy.
              </div>
            )}
          </main>
        </div>

        {showEditor && (
          <div className="fixed inset-0 z-2000 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
            <div className="w-full max-w-6xl bg-background p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between border-b border-ink/10 pb-3">
                <div>
                  <h2 className="text-xl font-semibold text-ink">
                    Edit place vocabulary
                  </h2>
                  <p className="text-xs text-ink/55">
                    Changes are saved through the existing vocabulary workflow.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditor(false)}
                  className="border border-ink/15 px-3 py-1.5 text-sm text-ink/70 hover:bg-ink/5"
                >
                  Close
                </button>
              </div>
              <ThesaurusEditor canEdit={canEdit} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConceptButton({
  concept,
  selected,
  onSelect,
  nested = false,
  childCount,
  placeCount,
}: {
  concept: PlaceTypeConcept;
  selected: boolean;
  onSelect: (typeId: string) => void;
  nested?: boolean;
  childCount?: number;
  placeCount: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(concept.typeId)}
      className={`flex w-full items-center gap-2 border-b border-stm-warm-100 py-2 pr-4 text-left transition-colors hover:bg-stm-warm-50 ${
        nested ? 'pl-14 text-xs' : 'pl-8 text-sm'
      } ${selected ? 'border-l-2 border-l-stm-sepia-500 bg-stm-sepia-50' : ''}`}
    >
      <span
        className={`${nested ? 'h-2.5 w-2.5' : 'h-3 w-3'} shrink-0 rounded-sm`}
        style={{ backgroundColor: concept.color }}
      />
      <span className={nested ? 'text-stm-warm-600' : 'text-stm-warm-700'}>
        {langEn(concept.prefLabel)}
      </span>
      <span className="ml-auto shrink-0 text-[10px] text-stm-warm-400">
        {placeCount > 0 ? placeCount : ''}
        {childCount != null && childCount > 0 ? ` · ${childCount} types` : ''}
      </span>
    </button>
  );
}

function RelatedFunctions({
  functions,
  selectedFunctionId,
  onSelect,
}: {
  functions: FunctionConcept[];
  selectedFunctionId: string | null;
  onSelect: (functionId: string) => void;
}) {
  return (
    <section className="site-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-ink">Related functions</h3>
          <p className="mt-1 text-xs leading-5 text-ink/55">
            Dated functions attested for places classified with this type.
            Select one to filter the place list below.
          </p>
        </div>
        <span className="text-xs text-ink/45">{functions.length} functions</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {functions.map((concept) => (
          <button
            key={`related-function-${concept.id}`}
            type="button"
            onClick={() => onSelect(concept.id)}
            className={`border px-2.5 py-1.5 text-left text-xs transition-colors ${
              selectedFunctionId === concept.id
                ? 'border-teal-strong bg-teal-strong text-white'
                : 'border-ink/10 bg-ink/[0.025] text-ink/70 hover:border-teal-strong'
            }`}
          >
            <span className="font-semibold">{concept.prefLabel.en}</span>
            <span className="ml-1 opacity-70">({concept.placeCount})</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SelectedFunctionSummary({
  functionConcept,
}: {
  functionConcept: FunctionConcept;
}) {
  return (
    <section className="border-l-4 border-teal-strong bg-teal-soft/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">
            Selected place function · crm:E55 Type / skos:Concept
          </p>
          <h3 className="mt-1 text-lg font-semibold text-ink">
            {functionConcept.prefLabel.en}
          </h3>
          <p className="text-xs text-ink/55">
            {functionConcept.prefLabel.nl} · source term{' '}
            {functionConcept.sourceLabels.join(', ')}
          </p>
        </div>
        <div className="text-right text-xs text-ink/55">
          <p>{functionConcept.placeCount} connected places</p>
          <p>
            {yearSpan(
              functionConcept.firstYear ?? undefined,
              functionConcept.lastYear ?? undefined,
            )}
          </p>
        </div>
      </div>
      <p className="mt-3 break-all font-mono text-[10px] text-ink/40">
        {functionConcept.uri}
      </p>
    </section>
  );
}

function PlacesForType({
  typeLabel,
  places,
  totalCount,
  search,
  onSearch,
  functionsByPlace,
  selectedFunctionId,
  onSelectFunction,
  onLoadMore,
}: {
  typeLabel: string;
  places: PlaceRecordIndexEntry[];
  totalCount: number;
  search: string;
  onSearch: (value: string) => void;
  functionsByPlace: Map<string, PlaceFunctionConnection[]>;
  selectedFunctionId: string | null;
  onSelectFunction: (functionId: string) => void;
  onLoadMore: () => void;
}) {
  return (
    <section className="site-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">
            Places classified as {typeLabel}
          </h3>
          <p className="mt-1 text-xs text-ink/55">
            {totalCount} public place {totalCount === 1 ? 'record' : 'records'}
            {selectedFunctionId ? ' with the selected function' : ''}.
          </p>
        </div>
        <label>
          <span className="sr-only">Search connected places</span>
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search places…"
            className="w-64 max-w-full border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-teal-strong"
          />
        </label>
      </div>

      {places.length > 0 ? (
        <div className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
          {places.map((place) => {
            const connections = functionsByPlace.get(place.id) ?? [];
            return (
              <article key={`connected-place-${place.id}`} className="py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    href={`/place/${place.id}`}
                    className="font-semibold text-teal-strong hover:underline"
                  >
                    {place.label}
                  </Link>
                  <span className="font-mono text-[10px] text-ink/35">
                    {place.id}
                  </span>
                </div>
                {connections.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {connections.map(({ concept, usages }) => (
                      <button
                        key={`place-function-${place.id}-${concept.id}`}
                        type="button"
                        onClick={() => onSelectFunction(concept.id)}
                        className={`border px-2 py-1 text-left text-[10px] ${
                          selectedFunctionId === concept.id
                            ? 'border-teal-strong bg-teal-strong text-white'
                            : 'border-ink/10 bg-ink/[0.025] text-ink/60 hover:border-teal-strong'
                        }`}
                      >
                        <span className="font-semibold">
                          {concept.prefLabel.en}
                        </span>{' '}
                        <span className="opacity-70">
                          {usages
                            .map((usage) =>
                              yearSpan(usage.startYear, usage.endYear),
                            )
                            .join(', ')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 border-y border-ink/10 py-6 text-center text-sm text-ink/45">
          No connected places match this selection.
        </p>
      )}

      {places.length < totalCount && (
        <button
          type="button"
          onClick={onLoadMore}
          className="mt-4 border border-ink/15 px-4 py-2 text-sm text-ink/70 hover:border-teal-strong"
        >
          Load more ({totalCount - places.length} remaining)
        </button>
      )}
    </section>
  );
}

function yearSpan(startYear?: number, endYear?: number): string {
  if (startYear == null) return 'undated';
  return endYear != null && endYear !== startYear
    ? `${startYear}–${endYear}`
    : String(startYear);
}

function ConceptDetails({
  selected,
  concepts,
  onSelect,
}: {
  selected: PlaceTypeConcept;
  concepts: PlaceTypeConcept[];
  onSelect: (typeId: string) => void;
}) {
  return (
    <div className="site-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-4 w-4 rounded-sm"
          style={{ backgroundColor: selected.color }}
        />
        <span className="rounded bg-stm-sepia-100 px-2 py-0.5 text-xs font-medium text-stm-sepia-700">
          skos:Concept
        </span>
        <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          crm:E55_Type
        </span>
        <h2 className="font-serif text-xl font-semibold text-stm-warm-900">
          {langEn(selected.prefLabel)}
        </h2>
      </div>

      <div className="mb-4">
        <LangLabels label="Preferred label" map={selected.prefLabel} />
        <LangArrayLabels label="Alternative labels" map={selected.altLabels} />
      </div>

      {langEn(selected.definition) && (
        <div className="mb-4 rounded border border-stm-warm-200 bg-stm-warm-50 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-stm-warm-600">
            Definition
          </span>
          <LangText map={selected.definition} />
        </div>
      )}
      {langEn(selected.editorialNote) && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-amber-700">
            Editorial note (colonial bias)
          </span>
          <LangText map={selected.editorialNote} className="text-amber-800" />
        </div>
      )}

      <dl className="space-y-3 text-sm">
        <Detail label="Type ID">
          <span className="font-mono text-xs">{selected.typeId}</span>
        </Detail>
        {selected.broader && (
          <Detail label="Broader">
            <span className="font-mono text-xs">
              {shortUri(selected.broader)}
            </span>
          </Detail>
        )}
        {selected.exactMatch.length > 0 && (
          <Detail label="Exact match">
            {selected.exactMatch.map((uri) => (
              <ExternalLink key={`exact-${uri}`} uri={uri} />
            ))}
          </Detail>
        )}
        {selected.closeMatch.length > 0 && (
          <Detail label="Close match">
            {selected.closeMatch.map((uri) => (
              <ExternalLink key={`close-${uri}`} uri={uri} />
            ))}
          </Detail>
        )}
        {selected.related.length > 0 && (
          <Detail label="Related">
            <div className="flex flex-wrap gap-1">
              {selected.related.map((uri) => {
                const related = concepts.find(
                  (concept) => concept.typeId === uri.replace(/.*\//, ''),
                );
                return (
                  <button
                    key={`related-${uri}`}
                    type="button"
                    onClick={() => related && onSelect(related.typeId)}
                    className="inline-flex items-center gap-1 rounded bg-stm-warm-100 px-2 py-0.5 text-xs text-stm-warm-600 hover:bg-stm-warm-200"
                  >
                    {related && (
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: related.color }}
                      />
                    )}
                    {related ? langEn(related.prefLabel) : shortUri(uri)}
                  </button>
                );
              })}
            </div>
          </Detail>
        )}
        {(selected.created || selected.modified) && (
          <Detail label="Dates">
            <span className="text-xs text-stm-warm-400">
              {selected.created ? `Created: ${selected.created}` : ''}
              {selected.created && selected.modified ? ' | ' : ''}
              {selected.modified ? `Modified: ${selected.modified}` : ''}
            </span>
          </Detail>
        )}
        {selected.historyNote && (
          <Detail label="History note">
            <span className="text-xs italic text-stm-warm-500">
              {selected.historyNote}
            </span>
          </Detail>
        )}
      </dl>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-stm-warm-500">{label}</dt>
      <dd className="text-stm-warm-700">{children}</dd>
    </div>
  );
}

function shortUri(uri: string): string {
  return uri
    .replace('https://data.surinametijdmachine.org/', 'stm:')
    .replace('stm:vocabulary/place-type/', 'stm:.../');
}

function LangLabels({ label, map }: { label: string; map: LangMap }) {
  const entries = Object.entries(map).filter(([, value]) => value);
  if (entries.length === 0) return null;
  return (
    <div className="mb-1">
      <span className="text-[10px] uppercase tracking-wide text-stm-warm-400">
        {label}
      </span>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
        {entries.map(([language, value]) => (
          <span key={`label-${language}`} className="text-sm text-stm-warm-700">
            <span className="mr-1 font-mono text-[10px] text-stm-warm-300">
              {language}
            </span>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function LangArrayLabels({ label, map }: { label: string; map: LangArrayMap }) {
  const entries = Object.entries(map).filter(
    ([, values]) => values && values.length > 0,
  );
  if (entries.length === 0) return null;
  return (
    <div className="mb-1">
      <span className="text-[10px] uppercase tracking-wide text-stm-warm-400">
        {label}
      </span>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {entries.flatMap(([language, values]) =>
          (values || []).map((value) => (
            <span
              key={`alt-label-${language}-${value}`}
              className="inline-flex items-center gap-1 rounded bg-stm-warm-100 px-2 py-0.5 text-xs text-stm-warm-600"
            >
              <span className="font-mono text-[9px] text-stm-warm-300">
                {language}
              </span>
              {value}
            </span>
          )),
        )}
      </div>
    </div>
  );
}

const languageNames: Record<string, string> = {
  en: 'English',
  nl: 'Nederlands',
  srn: 'Sranan Tongo',
};

function LangText({
  map,
  className = 'text-stm-warm-700',
}: {
  map: LangMap;
  className?: string;
}) {
  return (
    <div className="mt-1 space-y-0.5">
      {Object.entries(map)
        .filter(([, value]) => value)
        .map(([language, value]) => (
          <p key={`text-${language}`} className={`text-sm ${className}`}>
            <span className="mr-1 font-mono text-[10px] text-stm-warm-300">
              {languageNames[language] || language}
            </span>
            {value}
          </p>
        ))}
    </div>
  );
}

function ExternalLink({ uri }: { uri: string }) {
  let label = uri;
  if (uri.includes('wikidata.org/entity/')) {
    label = `Wikidata ${uri.split('/').pop()}`;
  } else if (uri.includes('getty.edu/aat/')) {
    label = `Getty AAT ${uri.split('/').pop()}`;
  }
  return (
    <a
      href={uri}
      target="_blank"
      rel="noopener noreferrer"
      className="block font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
    >
      {label}
    </a>
  );
}
