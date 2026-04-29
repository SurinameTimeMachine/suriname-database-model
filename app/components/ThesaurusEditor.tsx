'use client';

import type {
  LangArrayMap,
  LangMap,
  PlaceTypeConcept,
  ThesaurusScheme,
} from '@/lib/thesaurus';
import {
  invalidateThesaurusCache,
  langEn,
  parseThesaurus,
} from '@/lib/thesaurus';
import { useCallback, useEffect, useState } from 'react';

interface ThesaurusEditorProps {
  canEdit: boolean;
}

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'srn', label: 'Sranan Tongo' },
] as const;

const CRM_OPTIONS = [
  {
    value: 'E25_Human-Made_Feature',
    badge: 'E25',
    label: 'E25 Human-Made Feature',
  },
  {
    value: 'E26_Physical_Feature',
    badge: 'E26',
    label: 'E26 Physical Feature',
  },
  { value: 'E53_Place', badge: 'E53', label: 'E53 Place' },
];

const TOP_LEVEL_BROADER = [
  {
    id: 'stm:vocabulary/place-type/human-made',
    label: 'Human-Made Features',
    crmBadge: 'E25',
  },
  {
    id: 'stm:vocabulary/place-type/natural',
    label: 'Natural Features',
    crmBadge: 'E26',
  },
  {
    id: 'stm:vocabulary/place-type/administrative',
    label: 'Administrative Divisions',
    crmBadge: 'E53',
  },
];

function crmBadgeFromClass(crmClass: string): string {
  if (crmClass.startsWith('E25')) return 'E25';
  if (crmClass.startsWith('E26')) return 'E26';
  return 'E53';
}

/** Convert English label to a URL-safe typeId slug */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const EMPTY_CONCEPT: Omit<PlaceTypeConcept, 'id' | 'typeId'> = {
  prefLabel: {},
  altLabels: {},
  definition: {},
  editorialNote: {},
  historyNote: null,
  color: '#e6956b',
  crmClass: 'E25_Human-Made_Feature',
  crmBadge: 'E25',
  sortOrder: 99,
  broader: 'stm:vocabulary/place-type/human-made',
  related: [],
  exactMatch: [],
  closeMatch: [],
  created: null,
  modified: null,
};

/** Update a single language value in a LangMap */
function setLang(map: LangMap, lang: string, value: string): LangMap {
  const result = { ...map };
  if (value) result[lang] = value;
  else delete result[lang];
  return result;
}

/** Update a single language's array in a LangArrayMap */
function setLangArray(
  map: LangArrayMap,
  lang: string,
  csv: string,
): LangArrayMap {
  const result = { ...map };
  const arr = csv
    ? csv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (arr.length > 0) result[lang] = arr;
  else delete result[lang];
  return result;
}

/** Flatten LangArrayMap to string[] for display */
function flatAlt(map: LangArrayMap): string[] {
  return Object.values(map).flat().filter(Boolean) as string[];
}

export default function ThesaurusEditor({ canEdit }: ThesaurusEditorProps) {
  const [scheme, setScheme] = useState<ThesaurusScheme | null>(null);
  const [concepts, setConcepts] = useState<PlaceTypeConcept[]>([]);
  const [rawJsonLd, setRawJsonLd] = useState<Record<string, unknown> | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlaceTypeConcept | null>(null);
  const [scopeDraft, setScopeDraft] = useState<LangMap>({});
  const [editingScope, setEditingScope] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Create new concept state
  const [isCreating, setIsCreating] = useState(false);
  const [createTypeId, setCreateTypeId] = useState('');
  const [createDraft, setCreateDraft] =
    useState<Omit<PlaceTypeConcept, 'id' | 'typeId'>>(EMPTY_CONCEPT);
  const [typeIdManuallySet, setTypeIdManuallySet] = useState(false);

  useEffect(() => {
    fetch('/data/place-types-thesaurus.jsonld')
      .then((r) => r.json())
      .then((data) => {
        setRawJsonLd(data);
        const parsed = parseThesaurus(data);
        setScheme(parsed.scheme);
        setConcepts(parsed.concepts);
        setScopeDraft(parsed.scheme.scopeNote);
      });
  }, []);

  const startEdit = useCallback((concept: PlaceTypeConcept) => {
    setEditingId(concept.typeId);
    setDraft({
      ...concept,
      prefLabel: { ...concept.prefLabel },
      altLabels: { ...concept.altLabels },
      definition: { ...concept.definition },
      editorialNote: { ...concept.editorialNote },
      related: [...concept.related],
      exactMatch: [...concept.exactMatch],
      closeMatch: [...concept.closeMatch],
    });
    setError(null);
    setSuccess(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft(null);
  }, []);

  const startCreate = useCallback(() => {
    setIsCreating(true);
    setCreateTypeId('');
    setCreateDraft({
      ...EMPTY_CONCEPT,
      prefLabel: {},
      altLabels: {},
      definition: {},
      editorialNote: {},
      related: [],
      exactMatch: [],
      closeMatch: [],
    });
    setTypeIdManuallySet(false);
    setEditingId(null);
    setDraft(null);
    setError(null);
    setSuccess(null);
  }, []);

  const cancelCreate = useCallback(() => {
    setIsCreating(false);
    setCreateTypeId('');
    setCreateDraft(EMPTY_CONCEPT);
    setTypeIdManuallySet(false);
  }, []);

  const createConcept = useCallback(async () => {
    if (!rawJsonLd) return;
    if (!createTypeId.trim()) {
      setError('Type ID is required');
      return;
    }
    if (!createDraft.prefLabel.en?.trim()) {
      setError('English preferred label is required');
      return;
    }
    if (concepts.some((c) => c.typeId === createTypeId.trim())) {
      setError(`Type ID "${createTypeId}" already exists`);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const today = new Date().toISOString().slice(0, 10);
      const newEntry: Record<string, unknown> = {
        '@id': `stm:vocabulary/place-type/${createTypeId.trim()}`,
        '@type': ['skos:Concept', 'crm:E55_Type'],
        typeId: createTypeId.trim(),
        prefLabel: createDraft.prefLabel,
        inScheme: 'stm:vocabulary/place-type',
        broader: createDraft.broader,
        crmClass: createDraft.crmClass,
        crmBadge: crmBadgeFromClass(createDraft.crmClass),
        color: createDraft.color,
        sortOrder: createDraft.sortOrder,
        created: today,
        modified: today,
      };
      if (Object.keys(createDraft.altLabels).length > 0)
        newEntry.altLabel = createDraft.altLabels;
      if (Object.keys(createDraft.definition).length > 0)
        newEntry.definition = createDraft.definition;
      if (Object.keys(createDraft.editorialNote).length > 0)
        newEntry.editorialNote = createDraft.editorialNote;
      if (createDraft.historyNote)
        newEntry.historyNote = createDraft.historyNote;
      if (createDraft.related.length > 0)
        newEntry.related = createDraft.related;
      if (createDraft.exactMatch.length > 0)
        newEntry.exactMatch = createDraft.exactMatch;
      if (createDraft.closeMatch.length > 0)
        newEntry.closeMatch = createDraft.closeMatch;

      const updatedGraph = [
        ...(rawJsonLd['@graph'] as Record<string, unknown>[]),
        newEntry,
      ];
      const updatedJsonLd = { ...rawJsonLd, '@graph': updatedGraph };

      const res = await fetch('/api/thesaurus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedJsonLd),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setRawJsonLd(updatedJsonLd);
      const parsed = parseThesaurus(updatedJsonLd);
      setConcepts(parsed.concepts);
      setScheme(parsed.scheme);
      invalidateThesaurusCache();
      setIsCreating(false);
      setCreateTypeId('');
      setCreateDraft(EMPTY_CONCEPT);
      setTypeIdManuallySet(false);
      setSuccess(`Created: ${createDraft.prefLabel.en}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }, [rawJsonLd, createTypeId, createDraft, concepts]);

  const saveConcept = useCallback(async () => {
    if (!draft || !rawJsonLd) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedGraph = (
        rawJsonLd['@graph'] as Record<string, unknown>[]
      ).map((entry) => {
        if (entry.typeId !== draft.typeId) return entry;
        return {
          ...entry,
          prefLabel: draft.prefLabel,
          altLabel:
            Object.keys(draft.altLabels).length > 0
              ? draft.altLabels
              : undefined,
          definition:
            Object.keys(draft.definition).length > 0
              ? draft.definition
              : undefined,
          editorialNote:
            Object.keys(draft.editorialNote).length > 0
              ? draft.editorialNote
              : undefined,
          historyNote: draft.historyNote || undefined,
          color: draft.color,
          crmClass: draft.crmClass,
          crmBadge: crmBadgeFromClass(draft.crmClass),
          sortOrder: draft.sortOrder,
          broader: draft.broader,
          related: draft.related.length > 0 ? draft.related : undefined,
          exactMatch:
            draft.exactMatch.length > 0 ? draft.exactMatch : undefined,
          closeMatch:
            draft.closeMatch.length > 0 ? draft.closeMatch : undefined,
          modified: new Date().toISOString().slice(0, 10),
        };
      });

      const updatedJsonLd = { ...rawJsonLd, '@graph': updatedGraph };

      const res = await fetch('/api/thesaurus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedJsonLd),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setRawJsonLd(updatedJsonLd);
      const parsed = parseThesaurus(updatedJsonLd);
      setConcepts(parsed.concepts);
      setScheme(parsed.scheme);
      invalidateThesaurusCache();
      setEditingId(null);
      setDraft(null);
      setSuccess(`Saved: ${langEn(draft.prefLabel)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [draft, rawJsonLd]);

  const saveScopeNote = useCallback(async () => {
    if (!rawJsonLd) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedGraph = (
        rawJsonLd['@graph'] as Record<string, unknown>[]
      ).map((entry) => {
        const t = Array.isArray(entry['@type'])
          ? entry['@type']
          : [entry['@type']];
        if (t.includes('skos:ConceptScheme')) {
          return {
            ...entry,
            scopeNote: scopeDraft,
            modified: new Date().toISOString().slice(0, 10),
          };
        }
        return entry;
      });

      const updatedJsonLd = { ...rawJsonLd, '@graph': updatedGraph };

      const res = await fetch('/api/thesaurus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedJsonLd),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setRawJsonLd(updatedJsonLd);
      const parsed = parseThesaurus(updatedJsonLd);
      setScheme(parsed.scheme);
      invalidateThesaurusCache();
      setEditingScope(false);
      setSuccess('Scope note saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [rawJsonLd, scopeDraft]);

  if (!scheme) {
    return (
      <div className="text-sm text-stm-warm-400 py-4 text-center">
        Loading thesaurus...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-stm-warm-200 pb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-serif font-bold text-stm-warm-800">
            {langEn(scheme.prefLabel)}
          </h2>
          <p className="text-xs text-stm-warm-400 mt-0.5">
            SKOS ConceptScheme -- {concepts.filter((c) => !c.deprecated).length}{' '}
            place type concepts -- en / nl / srn
            {concepts.some((c) => c.deprecated) && (
              <span className="text-stm-warm-300">
                {' '}
                ({concepts.filter((c) => c.deprecated).length} deprecated)
              </span>
            )}
          </p>
        </div>
        {canEdit && !isCreating && (
          <button
            onClick={startCreate}
            className="px-3 py-1.5 text-xs font-medium bg-stm-sepia-600 text-white rounded hover:bg-stm-sepia-700"
          >
            + Add Concept
          </button>
        )}
      </div>

      {/* Scope note */}
      <div className="bg-white rounded border border-stm-warm-200 p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-stm-warm-600 uppercase tracking-wide">
            Scope Note
          </span>
          {canEdit && !editingScope && (
            <button
              onClick={() => setEditingScope(true)}
              className="text-[10px] text-stm-sepia-600 hover:text-stm-sepia-800"
            >
              Edit
            </button>
          )}
        </div>
        {editingScope ? (
          <div className="space-y-2">
            {LANGS.map(({ code, label }) => (
              <div key={code}>
                <label className="text-[10px] font-mono text-stm-warm-400 uppercase">
                  {label}
                </label>
                <textarea
                  value={scopeDraft[code] || ''}
                  onChange={(e) =>
                    setScopeDraft(setLang(scopeDraft, code, e.target.value))
                  }
                  rows={2}
                  className="w-full text-xs text-stm-warm-700 border border-stm-warm-200 rounded p-2 focus:ring-2 focus:ring-stm-sepia-400 outline-none"
                />
              </div>
            ))}
            <div className="flex gap-2">
              <button
                onClick={saveScopeNote}
                disabled={saving}
                className="px-3 py-1 text-xs font-medium bg-stm-sepia-600 text-white rounded hover:bg-stm-sepia-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setEditingScope(false);
                  setScopeDraft(scheme.scopeNote);
                }}
                className="px-3 py-1 text-xs font-medium bg-stm-warm-100 text-stm-warm-600 rounded hover:bg-stm-warm-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-stm-warm-600 leading-relaxed">
            {langEn(scheme.scopeNote) || (
              <span className="text-stm-warm-300 italic">No scope note</span>
            )}
          </p>
        )}
      </div>

      {/* Status messages */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="text-xs text-stm-teal-700 bg-stm-teal-50 border border-stm-teal-200 rounded px-3 py-2">
          {success}
        </div>
      )}

      {/* Concepts table + detail panel */}
      {/* === Create new concept panel === */}
      {isCreating && (
        <div className="bg-stm-sepia-50 border border-stm-sepia-200 rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-semibold text-stm-warm-800">
            New Concept
          </h3>

          {/* Row 1: Identity */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-stm-warm-500 uppercase">
                Type ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={createTypeId}
                onChange={(e) => {
                  setCreateTypeId(e.target.value);
                  setTypeIdManuallySet(true);
                }}
                placeholder="e.g. sugar-mill"
                className="w-full px-2 py-1.5 text-xs border border-stm-warm-200 rounded font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-stm-warm-500 uppercase">
                Color
              </label>
              <input
                type="color"
                value={createDraft.color}
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, color: e.target.value })
                }
                className="w-full h-8 p-0 border-0 cursor-pointer"
              />
            </div>
            <div>
              <label className="text-[10px] text-stm-warm-500 uppercase">
                CRM Class
              </label>
              <select
                value={createDraft.crmClass}
                onChange={(e) =>
                  setCreateDraft({
                    ...createDraft,
                    crmClass: e.target.value,
                    crmBadge: crmBadgeFromClass(e.target.value),
                  })
                }
                className="w-full px-2 py-1.5 text-xs border border-stm-warm-200 rounded"
              >
                {CRM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-stm-warm-500 uppercase">
                Sort Order
              </label>
              <input
                type="number"
                value={createDraft.sortOrder}
                onChange={(e) =>
                  setCreateDraft({
                    ...createDraft,
                    sortOrder: parseInt(e.target.value) || 99,
                  })
                }
                className="w-full px-2 py-1.5 text-xs border border-stm-warm-200 rounded"
              />
            </div>
          </div>

          {/* Broader (parent) */}
          <div>
            <label className="text-[10px] text-stm-warm-500 uppercase">
              Parent (broader)
            </label>
            <select
              value={createDraft.broader || ''}
              onChange={(e) =>
                setCreateDraft({
                  ...createDraft,
                  broader: e.target.value || null,
                })
              }
              className="w-full px-2 py-1.5 text-xs border border-stm-warm-200 rounded"
            >
              <optgroup label="Top-level Categories">
                {TOP_LEVEL_BROADER.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label} ({g.crmBadge})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Existing Concepts">
                {concepts
                  .filter((c) => !c.deprecated)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {langEn(c.prefLabel)} ({c.crmBadge}) [{c.typeId}]
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          {/* Multilingual labels */}
          <div>
            <h4 className="text-[10px] text-stm-warm-500 uppercase tracking-wide mb-2">
              Labels & Definitions
            </h4>
            <div className="grid grid-cols-3 gap-3">
              {LANGS.map(({ code, label }) => (
                <div key={code} className="space-y-2">
                  <div className="text-[10px] font-mono text-stm-sepia-600 font-medium">
                    {label}
                    {code === 'en' && (
                      <span className="text-red-400 ml-1">*</span>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] text-stm-warm-400">
                      Preferred Label
                    </label>
                    <input
                      type="text"
                      value={createDraft.prefLabel[code] || ''}
                      onChange={(e) => {
                        const updated = setLang(
                          createDraft.prefLabel,
                          code,
                          e.target.value,
                        );
                        setCreateDraft({ ...createDraft, prefLabel: updated });
                        if (code === 'en' && !typeIdManuallySet) {
                          setCreateTypeId(slugify(e.target.value));
                        }
                      }}
                      className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stm-warm-400">
                      Alt Labels (comma-sep.)
                    </label>
                    <input
                      type="text"
                      value={(createDraft.altLabels[code] || []).join(', ')}
                      onChange={(e) =>
                        setCreateDraft({
                          ...createDraft,
                          altLabels: setLangArray(
                            createDraft.altLabels,
                            code,
                            e.target.value,
                          ),
                        })
                      }
                      className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stm-warm-400">
                      Definition
                    </label>
                    <textarea
                      value={createDraft.definition[code] || ''}
                      onChange={(e) =>
                        setCreateDraft({
                          ...createDraft,
                          definition: setLang(
                            createDraft.definition,
                            code,
                            e.target.value,
                          ),
                        })
                      }
                      rows={2}
                      className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stm-warm-400">
                      Editorial Note
                    </label>
                    <textarea
                      value={createDraft.editorialNote[code] || ''}
                      onChange={(e) =>
                        setCreateDraft({
                          ...createDraft,
                          editorialNote: setLang(
                            createDraft.editorialNote,
                            code,
                            e.target.value,
                          ),
                        })
                      }
                      rows={2}
                      className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* External links */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-stm-warm-500 uppercase">
                Exact Match URIs (one per line)
              </label>
              <textarea
                value={createDraft.exactMatch.join('\n')}
                onChange={(e) =>
                  setCreateDraft({
                    ...createDraft,
                    exactMatch: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                rows={2}
                placeholder="http://www.wikidata.org/entity/Q..."
                className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded font-mono resize-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-stm-warm-500 uppercase">
                Close Match URIs (one per line)
              </label>
              <textarea
                value={createDraft.closeMatch.join('\n')}
                onChange={(e) =>
                  setCreateDraft({
                    ...createDraft,
                    closeMatch: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                rows={2}
                placeholder="http://vocab.getty.edu/aat/..."
                className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded font-mono resize-none"
              />
            </div>
          </div>

          {/* Related concepts picker */}
          <div>
            <label className="text-[10px] text-stm-warm-500 uppercase">
              Related Concepts
            </label>
            <div className="mt-1 max-h-32 overflow-y-auto border border-stm-warm-200 rounded bg-white p-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {concepts
                .filter((c) => !c.deprecated)
                .map((c) => {
                  const cId = c.id;
                  const checked = createDraft.related.includes(cId);
                  return (
                    <label
                      key={c.typeId}
                      className="flex items-center gap-1.5 cursor-pointer text-xs text-stm-warm-700 hover:text-stm-warm-900"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setCreateDraft({
                            ...createDraft,
                            related: checked
                              ? createDraft.related.filter((r) => r !== cId)
                              : [...createDraft.related, cId],
                          })
                        }
                        className="rounded border-stm-warm-300"
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0 inline-block"
                        style={{ backgroundColor: c.color }}
                      />
                      {langEn(c.prefLabel)}
                    </label>
                  );
                })}
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-stm-warm-200">
            <button
              onClick={createConcept}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-medium bg-stm-sepia-600 text-white rounded hover:bg-stm-sepia-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Create Concept'}
            </button>
            <button
              onClick={cancelCreate}
              className="px-4 py-1.5 text-xs font-medium bg-stm-warm-100 text-stm-warm-600 rounded hover:bg-stm-warm-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Concepts table */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-stm-warm-500 border-b border-stm-warm-200">
            <th className="py-2 px-2 font-medium w-8" />
            <th className="py-2 px-2 font-medium">Type ID</th>
            <th className="py-2 px-2 font-medium">EN</th>
            <th className="py-2 px-2 font-medium">NL</th>
            <th className="py-2 px-2 font-medium">SRN</th>
            <th className="py-2 px-2 font-medium">CRM</th>
            <th className="py-2 px-2 font-medium w-8">#</th>
            <th className="py-2 px-2 font-medium">Links</th>
            {canEdit && <th className="py-2 px-2 font-medium w-12" />}
          </tr>
        </thead>
        <tbody>
          {concepts.map((c) => {
            const isEditing = editingId === c.typeId;
            const altCount = flatAlt(c.altLabels).length;
            const linkCount = c.exactMatch.length + c.closeMatch.length;
            const hasNote = Object.keys(c.editorialNote).length > 0;

            return (
              <tr key={c.typeId} className="group">
                {/* Summary row */}
                <td className="py-1.5 px-2 border-b border-stm-warm-50">
                  <span
                    className="inline-block w-4 h-4 rounded-sm"
                    style={{ backgroundColor: c.color }}
                  />
                </td>
                <td className="py-1.5 px-2 border-b border-stm-warm-50 text-xs font-mono text-stm-warm-500">
                  {c.typeId}
                </td>
                <td className="py-1.5 px-2 border-b border-stm-warm-50 font-medium text-stm-warm-800">
                  {c.prefLabel.en || '--'}
                </td>
                <td className="py-1.5 px-2 border-b border-stm-warm-50 text-stm-warm-600 text-xs">
                  {c.prefLabel.nl || (
                    <span className="text-stm-warm-200">--</span>
                  )}
                </td>
                <td className="py-1.5 px-2 border-b border-stm-warm-50 text-stm-warm-600 text-xs">
                  {c.prefLabel.srn || (
                    <span className="text-stm-warm-200">--</span>
                  )}
                </td>
                <td className="py-1.5 px-2 border-b border-stm-warm-50">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stm-warm-100 text-stm-warm-600">
                    {c.crmBadge}
                  </span>
                </td>
                <td className="py-1.5 px-2 border-b border-stm-warm-50 text-xs text-stm-warm-400 text-center">
                  {c.sortOrder}
                </td>
                <td className="py-1.5 px-2 border-b border-stm-warm-50 text-xs text-stm-warm-400">
                  {linkCount > 0 && (
                    <span className="text-blue-500">{linkCount} ext</span>
                  )}
                  {linkCount > 0 && altCount > 0 && ' '}
                  {altCount > 0 && <span>{altCount} alt</span>}
                  {hasNote && (
                    <span
                      className="ml-1 text-amber-500"
                      title={langEn(c.editorialNote)}
                    >
                      bias
                    </span>
                  )}
                  {linkCount === 0 && altCount === 0 && !hasNote && (
                    <span className="text-stm-warm-200">--</span>
                  )}
                </td>
                {canEdit && (
                  <td className="py-1.5 px-2 border-b border-stm-warm-50">
                    <button
                      onClick={() => (isEditing ? cancelEdit() : startEdit(c))}
                      className="text-[10px] text-stm-sepia-600 hover:text-stm-sepia-800"
                    >
                      {isEditing ? 'Close' : 'Edit'}
                    </button>
                  </td>
                )}
                {/* Expanded edit panel */}
                {isEditing && draft && (
                  <td colSpan={canEdit ? 9 : 8} className="p-0">
                    <div className="bg-stm-sepia-50 border-t border-stm-warm-200 p-4 space-y-4">
                      {/* Row 1: Basic props */}
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label className="text-[10px] text-stm-warm-500 uppercase">
                            Color
                          </label>
                          <input
                            type="color"
                            value={draft.color}
                            onChange={(e) =>
                              setDraft({ ...draft, color: e.target.value })
                            }
                            className="w-full h-8 p-0 border-0 cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-stm-warm-500 uppercase">
                            CRM Class
                          </label>
                          <select
                            value={draft.crmClass}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                crmClass: e.target.value,
                                crmBadge: crmBadgeFromClass(e.target.value),
                              })
                            }
                            className="w-full px-2 py-1.5 text-xs border border-stm-warm-200 rounded"
                          >
                            {CRM_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-stm-warm-500 uppercase">
                            Sort Order
                          </label>
                          <input
                            type="number"
                            value={draft.sortOrder}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                sortOrder: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full px-2 py-1.5 text-xs border border-stm-warm-200 rounded"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-stm-warm-500 uppercase">
                            History Note
                          </label>
                          <input
                            type="text"
                            value={draft.historyNote || ''}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                historyNote: e.target.value || null,
                              })
                            }
                            placeholder="Changes..."
                            className="w-full px-2 py-1.5 text-xs border border-stm-warm-200 rounded"
                          />
                        </div>
                      </div>

                      {/* Broader (parent) */}
                      <div>
                        <label className="text-[10px] text-stm-warm-500 uppercase">
                          Parent (broader)
                        </label>
                        <select
                          value={draft.broader || ''}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              broader: e.target.value || null,
                            })
                          }
                          className="w-full px-2 py-1.5 text-xs border border-stm-warm-200 rounded"
                        >
                          <option value="">-- none --</option>
                          <optgroup label="Top-level Categories">
                            {TOP_LEVEL_BROADER.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.label} ({g.crmBadge})
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Existing Concepts">
                            {concepts
                              .filter((c) => c.typeId !== draft.typeId)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {langEn(c.prefLabel)} ({c.crmBadge}) [
                                  {c.typeId}]
                                </option>
                              ))}
                          </optgroup>
                        </select>
                      </div>

                      {/* Row 2: Multilingual labels */}
                      <div>
                        <h4 className="text-[10px] text-stm-warm-500 uppercase tracking-wide mb-2">
                          Labels & Definitions
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                          {LANGS.map(({ code, label }) => (
                            <div key={code} className="space-y-2">
                              <div className="text-[10px] font-mono text-stm-sepia-600 font-medium">
                                {label}
                              </div>
                              <div>
                                <label className="text-[10px] text-stm-warm-400">
                                  Preferred Label
                                </label>
                                <input
                                  type="text"
                                  value={draft.prefLabel[code] || ''}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      prefLabel: setLang(
                                        draft.prefLabel,
                                        code,
                                        e.target.value,
                                      ),
                                    })
                                  }
                                  className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-stm-warm-400">
                                  Alt Labels (comma-sep.)
                                </label>
                                <input
                                  type="text"
                                  value={(draft.altLabels[code] || []).join(
                                    ', ',
                                  )}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      altLabels: setLangArray(
                                        draft.altLabels,
                                        code,
                                        e.target.value,
                                      ),
                                    })
                                  }
                                  className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-stm-warm-400">
                                  Definition
                                </label>
                                <textarea
                                  value={draft.definition[code] || ''}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      definition: setLang(
                                        draft.definition,
                                        code,
                                        e.target.value,
                                      ),
                                    })
                                  }
                                  rows={2}
                                  className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded resize-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-stm-warm-400">
                                  Editorial Note
                                </label>
                                <textarea
                                  value={draft.editorialNote[code] || ''}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      editorialNote: setLang(
                                        draft.editorialNote,
                                        code,
                                        e.target.value,
                                      ),
                                    })
                                  }
                                  rows={2}
                                  className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded resize-none"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Row 3: External links + related */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-stm-warm-500 uppercase">
                            Exact Match URIs (one per line)
                          </label>
                          <textarea
                            value={draft.exactMatch.join('\n')}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                exactMatch: e.target.value
                                  .split('\n')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            rows={2}
                            placeholder="http://www.wikidata.org/entity/Q..."
                            className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded font-mono resize-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-stm-warm-500 uppercase">
                            Close Match URIs (one per line)
                          </label>
                          <textarea
                            value={draft.closeMatch.join('\n')}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                closeMatch: e.target.value
                                  .split('\n')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            rows={2}
                            placeholder="http://vocab.getty.edu/aat/..."
                            className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded font-mono resize-none"
                          />
                        </div>
                      </div>

                      {/* Related concepts picker */}
                      <div>
                        <label className="text-[10px] text-stm-warm-500 uppercase">
                          Related Concepts
                        </label>
                        <div className="mt-1 max-h-32 overflow-y-auto border border-stm-warm-200 rounded bg-white p-2 grid grid-cols-2 gap-x-4 gap-y-1">
                          {concepts
                            .filter((c) => c.typeId !== draft.typeId)
                            .map((c) => {
                              const cId = c.id;
                              const checked = draft.related.includes(cId);
                              return (
                                <label
                                  key={c.typeId}
                                  className="flex items-center gap-1.5 cursor-pointer text-xs text-stm-warm-700 hover:text-stm-warm-900"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setDraft({
                                        ...draft,
                                        related: checked
                                          ? draft.related.filter(
                                              (r) => r !== cId,
                                            )
                                          : [...draft.related, cId],
                                      })
                                    }
                                    className="rounded border-stm-warm-300"
                                  />
                                  <span
                                    className="w-2.5 h-2.5 rounded-sm shrink-0 inline-block"
                                    style={{ backgroundColor: c.color }}
                                  />
                                  {langEn(c.prefLabel)}
                                </label>
                              );
                            })}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2 border-t border-stm-warm-200">
                        <button
                          onClick={saveConcept}
                          disabled={saving}
                          className="px-4 py-1.5 text-xs font-medium bg-stm-sepia-600 text-white rounded hover:bg-stm-sepia-700 disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Save Concept'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-1.5 text-xs font-medium bg-stm-warm-100 text-stm-warm-600 rounded hover:bg-stm-warm-200"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            if (!draft || !rawJsonLd) return;
                            if (
                              !confirm(
                                `Deprecate "${langEn(draft.prefLabel)}"? The entry will be archived but kept in the file so its ID is never reused.`,
                              )
                            )
                              return;
                            setSaving(true);
                            setError(null);
                            try {
                              const res = await fetch('/api/thesaurus', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ typeId: draft.typeId }),
                              });
                              if (!res.ok) {
                                const data = await res.json();
                                throw new Error(
                                  data.error || 'Failed to delete',
                                );
                              }
                              // Mark deprecated in local state — entry stays in rawJsonLd
                              const today = new Date()
                                .toISOString()
                                .slice(0, 10);
                              const updatedGraph = (
                                rawJsonLd['@graph'] as Record<string, unknown>[]
                              ).map((entry) =>
                                entry.typeId === draft.typeId
                                  ? {
                                      ...entry,
                                      deprecated: true,
                                      deprecatedAt: today,
                                    }
                                  : entry,
                              );
                              const updatedJsonLd = {
                                ...rawJsonLd,
                                '@graph': updatedGraph,
                              };
                              setRawJsonLd(updatedJsonLd);
                              const parsed = parseThesaurus(updatedJsonLd);
                              setConcepts(parsed.concepts);
                              setScheme(parsed.scheme);
                              invalidateThesaurusCache();
                              setEditingId(null);
                              setDraft(null);
                              setSuccess(
                                `Deprecated: ${langEn(draft.prefLabel)}`,
                              );
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : 'Delete failed',
                              );
                            } finally {
                              setSaving(false);
                            }
                          }}
                          disabled={saving}
                          className="px-4 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 ml-auto"
                        >
                          Delete
                        </button>
                        {draft.modified && (
                          <span className="text-[10px] text-stm-warm-300 self-center">
                            Last modified: {draft.modified}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
