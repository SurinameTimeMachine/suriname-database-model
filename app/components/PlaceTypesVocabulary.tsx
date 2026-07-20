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
import { buildVocabularyUrl } from '@/lib/url';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function PlaceTypesVocabulary() {
  const { canEdit } = useAuth();
  const params = useParams<{ typeId?: string[] }>();
  const pathTypeId = params.typeId?.[0] ?? null;
  const [scheme, setScheme] = useState<ThesaurusScheme | null>(null);
  const [concepts, setConcepts] = useState<PlaceTypeConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(
    pathTypeId,
  );
  const [activeView, setActiveView] = useState<'browser' | 'editor'>('browser');

  useEffect(() => {
    void fetch('/data/place-types-thesaurus.jsonld')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load place types (${response.status})`);
        }
        return response.json();
      })
      .then((data: unknown) => {
        const parsed = parseThesaurus(data);
        setScheme(parsed.scheme);
        setConcepts(parsed.concepts);
      })
      .catch(() => setScheme(null))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectConcept = useCallback((typeId: string | null) => {
    setSelectedConcept(typeId);
    window.history.replaceState(
      null,
      '',
      typeId ? buildVocabularyUrl(typeId) : '/vocabulary',
    );
  }, []);

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
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
        <header className="mb-8">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-ink/70">
            <span className="inline-flex h-3 w-3 -skew-x-12 bg-teal-strong" />
            Controlled vocabulary
          </div>
          <h1 className="mb-2 text-3xl font-semibold text-ink">
            Place types and functions
          </h1>
          <p className="text-sm text-ink/70">
            The geographical-feature thesaurus describes structural place
            types and their hierarchy. Place functions are dated,
            source-qualified uses of physical places and have their own linked
            vocabulary.
          </p>
          <nav className="mt-5 flex gap-1 border-b border-ink/15">
            <span className="-mb-px border-b-2 border-teal-strong px-4 py-2 text-sm font-medium text-ink">
              Place types
            </span>
            <Link
              href="/vocabulary/place-function"
              className="px-4 py-2 text-sm font-medium text-ink/55 hover:text-ink"
            >
              Place functions
            </Link>
          </nav>
        </header>

        <div className="mb-6 flex gap-1 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveView('browser')}
            className={`-mb-px px-4 py-2 text-sm font-medium transition-colors ${
              activeView === 'browser'
                ? 'border-b-2 border-teal-strong text-ink'
                : 'text-ink/45 hover:text-ink/75'
            }`}
          >
            Browse hierarchy
          </button>
          <button
            type="button"
            onClick={() => setActiveView('editor')}
            className={`-mb-px px-4 py-2 text-sm font-medium transition-colors ${
              activeView === 'editor'
                ? 'border-b-2 border-teal-strong text-ink'
                : 'text-ink/45 hover:text-ink/75'
            }`}
          >
            Edit concepts
          </button>
        </div>

        {activeView === 'editor' ? (
          <ThesaurusEditor canEdit={canEdit} />
        ) : (
          <>
            <div className="site-surface mb-6 p-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-stm-sepia-100 px-2 py-0.5 text-xs font-medium text-stm-sepia-700">
                  ConceptScheme
                </span>
                <h2 className="font-serif text-lg font-semibold text-stm-warm-900">
                  {langEn(scheme.prefLabel)}
                </h2>
              </div>
              {langEn(scheme.scopeNote) && (
                <p className="mb-3 text-sm text-stm-warm-600">
                  {langEn(scheme.scopeNote)}
                </p>
              )}
              <div className="break-all font-mono text-xs text-stm-warm-400">
                {shortUri(scheme.id)}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-stm-warm-500">
                  Hierarchy
                </h3>
                <div className="site-surface">
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
                              count={subChildren.length}
                            />
                            {subChildren.map((sub) => (
                              <ConceptButton
                                key={`type-${sub.typeId}`}
                                concept={sub}
                                selected={selectedConcept === sub.typeId}
                                onSelect={handleSelectConcept}
                                nested
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2">
                <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-stm-warm-500">
                  {selected ? 'Concept details' : 'Select a concept'}
                </h3>
                {selected ? (
                  <ConceptDetails
                    selected={selected}
                    concepts={concepts}
                    onSelect={handleSelectConcept}
                  />
                ) : (
                  <div className="site-surface p-8 text-center">
                    <p className="text-sm text-stm-warm-400">
                      Click a concept in the hierarchy to view its labels,
                      definition, description, mappings, and editorial notes.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
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
  count,
}: {
  concept: PlaceTypeConcept;
  selected: boolean;
  onSelect: (typeId: string) => void;
  nested?: boolean;
  count?: number;
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
      {count != null && count > 0 && (
        <span className="ml-auto text-[10px] text-stm-warm-300">{count}</span>
      )}
    </button>
  );
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
