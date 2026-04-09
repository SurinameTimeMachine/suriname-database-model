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

function crmBadgeFromClass(crmClass: string): string {
  if (crmClass.startsWith('E25')) return 'E25';
  if (crmClass.startsWith('E26')) return 'E26';
  return 'E53';
}

function broaderFromClass(crmClass: string): string {
  if (crmClass.startsWith('E25')) return 'stm:vocabulary/place-type/human-made';
  if (crmClass.startsWith('E26')) return 'stm:vocabulary/place-type/natural';
  return 'stm:vocabulary/place-type/administrative';
}

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
          broader: broaderFromClass(draft.crmClass),
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
      <div className="border-b border-stm-warm-200 pb-3">
        <h2 className="text-lg font-serif font-bold text-stm-warm-800">
          {langEn(scheme.prefLabel)}
        </h2>
        <p className="text-xs text-stm-warm-400 mt-0.5">
          SKOS ConceptScheme -- {concepts.length} place type concepts -- en / nl
          / srn
        </p>
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
                      <div className="grid grid-cols-3 gap-3">
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
                        <div>
                          <label className="text-[10px] text-stm-warm-500 uppercase">
                            Related Concepts (URIs, one per line)
                          </label>
                          <textarea
                            value={draft.related.join('\n')}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                related: e.target.value
                                  .split('\n')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            rows={2}
                            placeholder="stm:vocabulary/place-type/..."
                            className="w-full px-2 py-1 text-xs border border-stm-warm-200 rounded font-mono resize-none"
                          />
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
                                `Delete "${langEn(draft.prefLabel)}"? This cannot be undone.`,
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
                              const updatedGraph = (
                                rawJsonLd['@graph'] as Record<string, unknown>[]
                              ).filter(
                                (entry) => entry.typeId !== draft.typeId,
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
                              setSuccess(`Deleted: ${langEn(draft.prefLabel)}`);
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
