'use client';

import ThesaurusEditor from '@/components/ThesaurusEditor';
import { langEn, parseThesaurus } from '@/lib/thesaurus';
import type {
  LangArrayMap,
  LangMap,
  PlaceTypeConcept,
  ThesaurusScheme,
} from '@/lib/thesaurus';
import { buildVocabularyUrl } from '@/lib/url';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

export default function VocabularyPage() {
  const { canEdit } = useAuth();
  const [scheme, setScheme] = useState<ThesaurusScheme | null>(null);
  const [concepts, setConcepts] = useState<PlaceTypeConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'browser' | 'editor'>('browser');

  // URL sync: read path param /vocabulary/{typeId}
  const params = useParams<{ typeId?: string[] }>();
  const router = useRouter();
  const initializedFromUrl = useRef(false);
  const pathTypeId = params.typeId?.[0] ?? null;


  useEffect(() => {
    fetch('/data/place-types-thesaurus.jsonld')
      .then((r) => r.json())
      .then((data) => {
        const parsed = parseThesaurus(data);
        setScheme(parsed.scheme);
        setConcepts(parsed.concepts);
      })
      .finally(() => setLoading(false));
  }, []);

  // Initialize selected concept from URL path (once concepts are loaded)
  useEffect(() => {
    if (initializedFromUrl.current || concepts.length === 0) return;
    initializedFromUrl.current = true;
    if (pathTypeId && concepts.some((c) => c.typeId === pathTypeId)) {
      setSelectedConcept(pathTypeId);
    }
  }, [concepts, pathTypeId]);

  // Sync selected concept to URL
  const handleSelectConcept = useCallback(
    (typeId: string | null) => {
      setSelectedConcept(typeId);
      const newUrl = typeId ? buildVocabularyUrl(typeId) : '/vocabulary';
      router.replace(newUrl, { scroll: false });
    },
    [router],
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-stm-warm-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-stm-sepia-400 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-stm-warm-500 text-sm">Loading thesaurus...</p>
        </div>
      </div>
    );
  }

  if (!scheme) {
    return (
      <div className="h-full flex items-center justify-center bg-stm-warm-50">
        <p className="text-stm-warm-500">Failed to load thesaurus data.</p>
      </div>
    );
  }

  const selected = selectedConcept
    ? concepts.find((c) => c.typeId === selectedConcept)
    : null;

  function shortUri(uri: string): string {
    return uri
      .replace('https://data.suriname-timemachine.org/', 'stm:')
      .replace('stm:vocabulary/place-type/', 'stm:.../');
  }

  // Build tree from thesaurus broader relationships
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

  /** Get direct children of a broader URI, excluding concepts that have their own children (they are rendered as sub-groups) */
  function getDirectChildren(broaderUri: string): PlaceTypeConcept[] {
    return concepts.filter((c) => c.broader === broaderUri);
  }

  /** Check if a concept has narrower children in the concepts list */
  function hasChildren(conceptId: string): boolean {
    return concepts.some((c) => c.broader === conceptId);
  }

  return (
    <div className="h-full overflow-y-auto bg-stm-warm-50">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-serif font-bold text-stm-warm-900 mb-2">
            Vocabulary
          </h1>
          <p className="text-stm-warm-600 text-sm">
            SKOS thesaurus for controlled vocabulary terms used in the Suriname
            Time Machine. Concepts are dual-typed as both{' '}
            <code className="text-xs bg-stm-warm-100 px-1 py-0.5 rounded">
              skos:Concept
            </code>{' '}
            and{' '}
            <code className="text-xs bg-stm-warm-100 px-1 py-0.5 rounded">
              crm:E55_Type
            </code>{' '}
            for CIDOC-CRM compatibility.
          </p>
        </div>

        {/* View tabs */}
        <div className="flex gap-1 mb-6 border-b border-stm-warm-200">
          <button
            onClick={() => setActiveView('browser')}
            className={`px-4 py-2 text-sm font-medium transition-colors -mb-px ${
              activeView === 'browser'
                ? 'border-b-2 border-stm-sepia-600 text-stm-sepia-700'
                : 'text-stm-warm-400 hover:text-stm-warm-600'
            }`}
          >
            Browse Hierarchy
          </button>
          <button
            onClick={() => setActiveView('editor')}
            className={`px-4 py-2 text-sm font-medium transition-colors -mb-px ${
              activeView === 'editor'
                ? 'border-b-2 border-stm-sepia-600 text-stm-sepia-700'
                : 'text-stm-warm-400 hover:text-stm-warm-600'
            }`}
          >
            Edit Concepts
          </button>
        </div>

        {activeView === 'editor' ? (
          <ThesaurusEditor canEdit={canEdit} />
        ) : (
          <>
            {/* Concept Scheme */}
            <div className="bg-white border border-stm-warm-200 rounded-lg p-5 mb-6 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-stm-sepia-100 text-stm-sepia-700 rounded">
                  ConceptScheme
                </span>
                <h2 className="text-lg font-serif font-semibold text-stm-warm-900">
                  {langEn(scheme.prefLabel)}
                </h2>
              </div>
              {langEn(scheme.scopeNote) && (
                <p className="text-sm text-stm-warm-600 mb-3">
                  {langEn(scheme.scopeNote)}
                </p>
              )}
              <div className="text-xs text-stm-warm-400 font-mono break-all">
                {shortUri(scheme.id)}
              </div>
            </div>

            {/* Concept Tree */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Tree panel */}
              <div className="lg:col-span-1">
                <h3 className="text-sm font-medium text-stm-warm-500 uppercase tracking-wider mb-3">
                  Hierarchy
                </h3>
                <div className="bg-white border border-stm-warm-200 rounded-lg shadow-sm">
                  {hierarchyGroups.map((group) => {
                    const children = getDirectChildren(group.broader);
                    return (
                      <div key={group.broader}>
                        <div className="px-4 py-3 border-b border-stm-warm-100 bg-stm-warm-50/50">
                          <span className="font-medium text-stm-warm-800 text-sm">
                            {group.label}
                          </span>
                          <span className="ml-2 text-[10px] font-mono text-stm-warm-400">
                            {group.crmClass}
                          </span>
                        </div>
                        {children.map((child) => {
                          const subChildren = getDirectChildren(child.id);
                          return (
                            <div key={child.typeId}>
                              <button
                                type="button"
                                onClick={() => handleSelectConcept(child.typeId)}
                                className={`w-full text-left pl-8 pr-4 py-2 border-b border-stm-warm-100 hover:bg-stm-warm-50 transition-colors flex items-center gap-2 ${
                                  selectedConcept === child.typeId
                                    ? 'bg-stm-sepia-50 border-l-2 border-l-stm-sepia-500'
                                    : ''
                                }`}
                              >
                                <span
                                  className="inline-block w-3 h-3 rounded-sm shrink-0"
                                  style={{ backgroundColor: child.color }}
                                />
                                <span className="text-stm-warm-700 text-sm">
                                  {langEn(child.prefLabel)}
                                </span>
                                {subChildren.length > 0 && (
                                  <span className="text-[10px] text-stm-warm-300 ml-auto">
                                    {subChildren.length}
                                  </span>
                                )}
                              </button>
                              {subChildren.map((sub) => (
                                <button
                                  key={sub.typeId}
                                  type="button"
                                  onClick={() => handleSelectConcept(sub.typeId)}
                                  className={`w-full text-left pl-14 pr-4 py-1.5 border-b border-stm-warm-100 hover:bg-stm-warm-50 transition-colors flex items-center gap-2 ${
                                    selectedConcept === sub.typeId
                                      ? 'bg-stm-sepia-50 border-l-2 border-l-stm-sepia-500'
                                      : ''
                                  }`}
                                >
                                  <span
                                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                                    style={{ backgroundColor: sub.color }}
                                  />
                                  <span className="text-stm-warm-600 text-xs">
                                    {langEn(sub.prefLabel)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detail panel */}
              <div className="lg:col-span-2">
                <h3 className="text-sm font-medium text-stm-warm-500 uppercase tracking-wider mb-3">
                  {selected ? 'Concept Details' : 'Select a concept'}
                </h3>
                {selected ? (
                  <div className="bg-white border border-stm-warm-200 rounded-lg p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="inline-block w-4 h-4 rounded-sm"
                        style={{ backgroundColor: selected.color }}
                      />
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-stm-sepia-100 text-stm-sepia-700 rounded">
                        skos:Concept
                      </span>
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                        crm:E55_Type
                      </span>
                      <h2 className="text-xl font-serif font-semibold text-stm-warm-900">
                        {langEn(selected.prefLabel)}
                      </h2>
                    </div>

                    {/* Multilingual labels */}
                    <div className="mb-4">
                      <LangLabels
                        label="Preferred Label"
                        map={selected.prefLabel}
                      />
                      <LangArrayLabels
                        label="Alternative Labels"
                        map={selected.altLabels}
                      />
                    </div>

                    {/* Definition */}
                    {langEn(selected.definition) && (
                      <div className="bg-stm-warm-50 border border-stm-warm-200 rounded px-3 py-2 mb-4">
                        <span className="text-xs font-medium text-stm-warm-600 uppercase tracking-wide">
                          Definition
                        </span>
                        <LangText map={selected.definition} />
                      </div>
                    )}

                    {/* Editorial note (colonial bias) */}
                    {langEn(selected.editorialNote) && (
                      <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
                        <span className="text-xs font-medium text-amber-700 uppercase tracking-wide">
                          Editorial Note (Colonial Bias)
                        </span>
                        <LangText
                          map={selected.editorialNote}
                          className="text-amber-800"
                        />
                      </div>
                    )}

                    <dl className="space-y-3 text-sm">
                      <div>
                        <dt className="text-stm-warm-500 font-medium">
                          Type ID
                        </dt>
                        <dd className="text-stm-warm-700 font-mono text-xs">
                          {selected.typeId}
                        </dd>
                      </div>

                      {selected.broader && (
                        <div>
                          <dt className="text-stm-warm-500 font-medium">
                            Broader
                          </dt>
                          <dd className="text-stm-warm-700 font-mono text-xs">
                            {shortUri(selected.broader)}
                          </dd>
                        </div>
                      )}

                      {/* External links */}
                      {selected.exactMatch.length > 0 && (
                        <div>
                          <dt className="text-stm-warm-500 font-medium">
                            Exact Match
                          </dt>
                          <dd className="space-y-0.5">
                            {selected.exactMatch.map((uri) => (
                              <ExternalLink key={uri} uri={uri} />
                            ))}
                          </dd>
                        </div>
                      )}

                      {selected.closeMatch.length > 0 && (
                        <div>
                          <dt className="text-stm-warm-500 font-medium">
                            Close Match
                          </dt>
                          <dd className="space-y-0.5">
                            {selected.closeMatch.map((uri) => (
                              <ExternalLink key={uri} uri={uri} />
                            ))}
                          </dd>
                        </div>
                      )}

                      {/* Related concepts */}
                      {selected.related.length > 0 && (
                        <div>
                          <dt className="text-stm-warm-500 font-medium">
                            Related
                          </dt>
                          <dd className="flex gap-1 flex-wrap">
                            {selected.related.map((uri) => {
                              const relId = uri.replace(/.*\//, '');
                              const rel = concepts.find(
                                (c) => c.typeId === relId,
                              );
                              return (
                                <button
                                  key={uri}
                                  onClick={() =>
                                    rel && handleSelectConcept(rel.typeId)
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-stm-warm-100 text-stm-warm-600 rounded hover:bg-stm-warm-200 transition-colors"
                                >
                                  {rel && (
                                    <span
                                      className="w-2 h-2 rounded-sm"
                                      style={{ backgroundColor: rel.color }}
                                    />
                                  )}
                                  {rel ? langEn(rel.prefLabel) : shortUri(uri)}
                                </button>
                              );
                            })}
                          </dd>
                        </div>
                      )}

                      {/* Timestamps */}
                      {(selected.created || selected.modified) && (
                        <div>
                          <dt className="text-stm-warm-500 font-medium">
                            Dates
                          </dt>
                          <dd className="text-stm-warm-400 text-xs">
                            {selected.created && (
                              <span>Created: {selected.created}</span>
                            )}
                            {selected.created && selected.modified && (
                              <span className="mx-2">|</span>
                            )}
                            {selected.modified && (
                              <span>Modified: {selected.modified}</span>
                            )}
                          </dd>
                        </div>
                      )}

                      {selected.historyNote && (
                        <div>
                          <dt className="text-stm-warm-500 font-medium">
                            History Note
                          </dt>
                          <dd className="text-stm-warm-500 text-xs italic">
                            {selected.historyNote}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                ) : (
                  <div className="bg-white border border-stm-warm-200 rounded-lg p-8 shadow-sm text-center">
                    <p className="text-stm-warm-400 text-sm">
                      Click a concept in the hierarchy to view its details.
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

/* --- Helper components for multilingual display --- */

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  nl: 'Nederlands',
  srn: 'Sranan Tongo',
};

function LangLabels({ label, map }: { label: string; map: LangMap }) {
  const entries = Object.entries(map).filter(([, v]) => v);
  if (entries.length === 0) return null;
  return (
    <div className="mb-1">
      <span className="text-[10px] text-stm-warm-400 uppercase tracking-wide">
        {label}
      </span>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
        {entries.map(([lang, val]) => (
          <span key={lang} className="text-sm text-stm-warm-700">
            <span className="text-[10px] font-mono text-stm-warm-300 mr-1">
              {lang}
            </span>
            {val}
          </span>
        ))}
      </div>
    </div>
  );
}

function LangArrayLabels({ label, map }: { label: string; map: LangArrayMap }) {
  const entries = Object.entries(map).filter(([, v]) => v && v.length > 0);
  if (entries.length === 0) return null;
  return (
    <div className="mb-1">
      <span className="text-[10px] text-stm-warm-400 uppercase tracking-wide">
        {label}
      </span>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {entries.flatMap(([lang, vals]) =>
          (vals || []).map((v) => (
            <span
              key={`${lang}-${v}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-stm-warm-100 text-stm-warm-600 rounded"
            >
              <span className="text-[9px] font-mono text-stm-warm-300">
                {lang}
              </span>
              {v}
            </span>
          )),
        )}
      </div>
    </div>
  );
}

function LangText({
  map,
  className = 'text-stm-warm-700',
}: {
  map: LangMap;
  className?: string;
}) {
  const entries = Object.entries(map).filter(([, v]) => v);
  return (
    <div className="mt-1 space-y-0.5">
      {entries.map(([lang, val]) => (
        <p key={lang} className={`text-sm ${className}`}>
          <span className="text-[10px] font-mono text-stm-warm-300 mr-1">
            {LANG_NAMES[lang] || lang}
          </span>
          {val}
        </p>
      ))}
    </div>
  );
}

function ExternalLink({ uri }: { uri: string }) {
  let label = uri;
  if (uri.includes('wikidata.org/entity/')) {
    label = 'Wikidata ' + uri.split('/').pop();
  } else if (uri.includes('getty.edu/aat/')) {
    label = 'Getty AAT ' + uri.split('/').pop();
  }
  return (
    <a
      href={uri}
      target="_blank"
      rel="noopener noreferrer"
      className="block text-xs text-blue-600 hover:text-blue-800 hover:underline font-mono"
    >
      {label}
    </a>
  );
}
