'use client';

import { useAuth } from '@/lib/auth';
import {
  getActiveSources,
  getFutureSources,
  getSourcesByCategory,
  type Source,
  type SourceCategory,
  useSourceRegistry,
} from '@/lib/sources';
import { buildSourceUrl } from '@/lib/url';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

function sortedCategories(categories: SourceCategory[]): SourceCategory[] {
  return [...categories].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.categoryId);
    const bi = CATEGORY_ORDER.indexOf(b.categoryId);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

const CATEGORY_ORDER = ['map', 'register', 'almanac', 'dataset', 'external'];

export default function SourcesPage() {
  const { categories, sources, loading, prefLabel, description } =
    useSourceRegistry();
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [showFuture, setShowFuture] = useState(false);
  const { canEdit } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // URL sync: read path param /sources/{sourceId}
  const params = useParams<{ sourceId?: string[] }>();
  const router = useRouter();
  const initializedFromUrl = useRef(false);
  const pathSourceId = params.sourceId?.[0] ?? null;

  // Initialize expanded source from URL path (once sources are loaded)
  useEffect(() => {
    if (initializedFromUrl.current || sources.length === 0) return;
    initializedFromUrl.current = true;
    if (pathSourceId && sources.some((s) => s.sourceId === pathSourceId)) {
      setExpandedSource(pathSourceId);
      // Scroll to the source after a brief delay for DOM render
      requestAnimationFrame(() => {
        const el = document.getElementById(`source-${pathSourceId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [sources, pathSourceId]);

  // Sync expandedSource to URL
  const handleToggleSource = useCallback(
    (sourceId: string | null) => {
      setExpandedSource(sourceId);
      const newUrl = sourceId ? buildSourceUrl(sourceId) : '/sources';
      router.replace(newUrl, { scroll: false });
    },
    [router],
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-stm-warm-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-stm-sepia-400 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-stm-warm-500 text-sm">Loading sources...</p>
        </div>
      </div>
    );
  }

  const activeSources = getActiveSources(sources);
  const futureSources = getFutureSources(sources);
  const activeByCategory = getSourcesByCategory(activeSources, categories);
  const futureByCategory = getSourcesByCategory(futureSources, categories);
  const orderedCategories = sortedCategories(categories);

  return (
    <div className="h-full overflow-y-auto bg-stm-warm-50">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-serif font-bold text-stm-warm-900 mb-2">
              Sources
            </h1>
            <p className="text-stm-warm-600 text-sm max-w-3xl">
              Registry of historical sources (
              <code className="text-xs bg-stm-warm-100 px-1 py-0.5 rounded">
                E22 Human-Made Object
              </code>
              ) used in the Suriname Time Machine. Each source is a physical or
              digital artifact that carries information about places, persons,
              and organizations.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {canEdit && (
              <button
                onClick={() => {
                  setShowAddForm(true);
                  setEditingId(null);
                }}
                className="px-3 py-1.5 text-sm font-medium bg-stm-teal-600 text-white rounded hover:bg-stm-teal-700 transition-colors"
              >
                + Add Source
              </button>
            )}
          </div>
        </div>

        {/* Add source form */}
        {showAddForm && (
          <SourceForm
            categories={orderedCategories}
            onSave={async (data) => {
              const res = await fetch('/api/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              });
              if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save');
              }
              setShowAddForm(false);
              window.location.reload();
            }}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {/* Stats bar */}
        <div className="flex gap-4 mb-8">
          <div className="bg-white border border-stm-warm-200 rounded-lg px-4 py-3 shadow-sm">
            <div className="text-2xl font-bold text-stm-warm-900">
              {sources.length}
            </div>
            <div className="text-xs text-stm-warm-500">Total Sources</div>
          </div>
          <div className="bg-white border border-stm-teal-200 rounded-lg px-4 py-3 shadow-sm">
            <div className="text-2xl font-bold text-stm-teal-700">
              {activeSources.length}
            </div>
            <div className="text-xs text-stm-teal-600">Linked to Gazetteer</div>
          </div>
          <div className="bg-white border border-stm-warm-200 rounded-lg px-4 py-3 shadow-sm">
            <div className="text-2xl font-bold text-stm-warm-500">
              {futureSources.length}
            </div>
            <div className="text-xs text-stm-warm-400">Available / Future</div>
          </div>
          <div className="bg-white border border-stm-warm-200 rounded-lg px-4 py-3 shadow-sm">
            <div className="text-2xl font-bold text-stm-warm-900">
              {categories.length}
            </div>
            <div className="text-xs text-stm-warm-500">Categories</div>
          </div>
        </div>

        {/* Active Sources */}
        <div className="mb-10">
          <h2 className="text-lg font-serif font-semibold text-stm-warm-900 mb-1">
            Active Sources
          </h2>
          <p className="text-sm text-stm-warm-500 mb-4">
            Sources currently linked to places in the gazetteer.
          </p>

          <div className="space-y-6">
            {orderedCategories.map((cat) => {
              const catSources = activeByCategory.get(cat.id) || [];
              if (catSources.length === 0) return null;
              return (
                <CategoryGroup
                  key={cat.id}
                  category={cat}
                  sources={catSources}
                  expandedSource={expandedSource}
                  onToggle={handleToggleSource}
                  variant="active"
                  canEdit={canEdit}
                  editingId={editingId}
                  onEdit={setEditingId}
                  categories={orderedCategories}
                />
              );
            })}
          </div>
        </div>

        {/* Future Sources */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-serif font-semibold text-stm-warm-900">
              Available Sources
            </h2>
            <span className="text-xs text-stm-warm-400 bg-stm-warm-100 px-2 py-0.5 rounded">
              {futureSources.length} sources
            </span>
            <button
              onClick={() => setShowFuture(!showFuture)}
              className="text-xs text-stm-sepia-600 hover:text-stm-sepia-800 underline"
            >
              {showFuture ? 'Collapse' : 'Expand'}
            </button>
          </div>
          <p className="text-sm text-stm-warm-500 mb-4">
            Known sources not yet linked to places in the gazetteer. These
            include 126 historic maps from the Nationaal Archief, UB Leiden, and
            UB Amsterdam collections.
          </p>

          {showFuture && (
            <div className="space-y-6">
              {orderedCategories.map((cat) => {
                const catSources = futureByCategory.get(cat.id) || [];
                if (catSources.length === 0) return null;
                return (
                  <CategoryGroup
                    key={cat.id}
                    category={cat}
                    sources={catSources}
                    expandedSource={expandedSource}
                    onToggle={handleToggleSource}
                    variant="future"
                    canEdit={canEdit}
                    editingId={editingId}
                    onEdit={setEditingId}
                    categories={orderedCategories}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- Sub-components --- */

function CategoryGroup({
  category,
  sources,
  expandedSource,
  onToggle,
  variant,
  canEdit,
  editingId,
  onEdit,
  categories,
}: {
  category: SourceCategory;
  sources: Source[];
  expandedSource: string | null;
  onToggle: (id: string | null) => void;
  variant: 'active' | 'future';
  canEdit: boolean;
  editingId: string | null;
  onEdit: (id: string | null) => void;
  categories: SourceCategory[];
}) {
  const isFuture = variant === 'future';

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3
          className={`text-sm font-medium uppercase tracking-wider ${
            isFuture ? 'text-stm-warm-400' : 'text-stm-warm-600'
          }`}
        >
          {category.prefLabel}
        </h3>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            isFuture
              ? 'bg-stm-warm-100 text-stm-warm-400'
              : 'bg-stm-sepia-100 text-stm-sepia-600'
          }`}
        >
          {sources.length}
        </span>
      </div>

      <div className="space-y-1">
        {sources.map((src) => (
          <SourceCard
            key={src.sourceId}
            source={src}
            isExpanded={expandedSource === src.sourceId}
            onToggle={() =>
              onToggle(expandedSource === src.sourceId ? null : src.sourceId)
            }
            variant={variant}
            canEdit={canEdit}
            isEditing={editingId === src.sourceId}
            onEdit={() =>
              onEdit(editingId === src.sourceId ? null : src.sourceId)
            }
            categories={categories}
            onDelete={async (sourceId: string) => {
              const res = await fetch('/api/sources', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId }),
              });
              if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to delete');
              }
              window.location.reload();
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SourceCard({
  source,
  isExpanded,
  onToggle,
  variant,
  canEdit,
  isEditing,
  onEdit,
  categories,
  onDelete,
}: {
  source: Source;
  isExpanded: boolean;
  onToggle: () => void;
  variant: 'active' | 'future';
  canEdit: boolean;
  isEditing: boolean;
  onEdit: () => void;
  categories: SourceCategory[];
  onDelete?: (sourceId: string) => Promise<void>;
}) {
  const isFuture = variant === 'future';

  return (
    <div
      id={`source-${source.sourceId}`}
      className={`border rounded-lg transition-colors ${
        isFuture
          ? 'border-stm-warm-150 bg-stm-warm-50/50'
          : 'border-stm-warm-200 bg-white shadow-sm'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        {/* Linked badge */}
        {source.linkedToGazetteer && (
          <span className="shrink-0 w-2 h-2 rounded-full bg-stm-teal-500" />
        )}

        {/* Label */}
        <span
          className={`font-medium text-sm flex-1 ${
            isFuture ? 'text-stm-warm-500' : 'text-stm-warm-800'
          }`}
        >
          {source.prefLabel}
        </span>

        {/* Year badge */}
        {(source.mapYear || source.timeSpan) && (
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded ${
              isFuture
                ? 'bg-stm-warm-100 text-stm-warm-400'
                : 'bg-stm-sepia-50 text-stm-sepia-600'
            }`}
          >
            {source.timeSpan || source.mapYear}
          </span>
        )}

        {/* Archive badge */}
        {source.holdingArchive && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded hidden sm:inline ${
              isFuture
                ? 'bg-stm-warm-100 text-stm-warm-400'
                : 'bg-stm-warm-100 text-stm-warm-500'
            }`}
          >
            {source.holdingArchive}
          </span>
        )}

        {/* IIIF badge */}
        {(source.iiifManifest || source.iiifInfoUrl) && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium hidden sm:inline">
            IIIF
          </span>
        )}

        {/* Expand indicator */}
        <svg
          className={`w-4 h-4 text-stm-warm-400 transition-transform shrink-0 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-stm-warm-100">
          {isEditing ? (
            <SourceEditForm
              source={source}
              categories={categories}
              onSave={async (data) => {
                const res = await fetch('/api/sources', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                });
                if (!res.ok) {
                  const err = await res.json();
                  throw new Error(err.error || 'Failed to save');
                }
                onEdit();
                window.location.reload();
              }}
              onCancel={onEdit}
            />
          ) : (
            <div className="pt-3 space-y-2">
              {source.description && (
                <p className="text-sm text-stm-warm-600">
                  {source.description}
                </p>
              )}

              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {source.sourceId && (
                  <MetaField label="Source ID" value={source.sourceId} mono />
                )}
                {source.maker && (
                  <MetaField label="Maker" value={source.maker} />
                )}
                {source.publisher && (
                  <MetaField label="Publisher" value={source.publisher} />
                )}
                {source.publicationPlace && (
                  <MetaField
                    label="Published"
                    value={source.publicationPlace}
                  />
                )}
                {source.holdingArchive && (
                  <MetaField label="Archive" value={source.holdingArchive} />
                )}
              </dl>

              {/* Links */}
              <div className="flex gap-3 pt-1">
                {source.handleUrl && (
                  <a
                    href={source.handleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Archive Link
                  </a>
                )}
                {source.iiifManifest && (
                  <a
                    href={source.iiifManifest}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    IIIF Manifest
                  </a>
                )}
                {source.iiifInfoUrl && (
                  <a
                    href={source.iiifInfoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    IIIF Image
                  </a>
                )}
                {source.sameAs && (
                  <a
                    href={source.sameAs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    External Link
                  </a>
                )}
              </div>

              {/* Edit button */}
              {canEdit && (
                <div className="pt-2 border-t border-stm-warm-100 flex gap-3">
                  <button
                    type="button"
                    onClick={onEdit}
                    className="text-xs text-stm-sepia-600 hover:text-stm-sepia-800 font-medium"
                  >
                    Edit source
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete "${source.prefLabel}"? This cannot be undone.`,
                          )
                        ) {
                          onDelete(source.sourceId);
                        }
                      }}
                      className="text-xs text-red-600 hover:text-red-800 font-medium ml-auto"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetaField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="col-span-1">
      <dt className="text-[10px] text-stm-warm-400 uppercase tracking-wide">
        {label}
      </dt>
      <dd
        className={`text-stm-warm-700 ${mono ? 'font-mono text-xs' : 'text-sm'}`}
      >
        {value}
      </dd>
    </div>
  );
}

/* Inline edit form for an existing source */
function SourceEditForm({
  source,
  categories,
  onSave,
  onCancel,
}: {
  source: Source;
  categories: SourceCategory[];
  onSave: (data: {
    sourceId: string;
    prefLabel: string;
    description: string | null;
    categoryId: string;
    linkedToGazetteer: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const currentCatId = source.type.split('/').pop() || '';
  const [label, setLabel] = useState(source.prefLabel);
  const [desc, setDesc] = useState(source.description || '');
  const [catId, setCatId] = useState(currentCatId);
  const [linked, setLinked] = useState(source.linkedToGazetteer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        sourceId: source.sourceId,
        prefLabel: label,
        description: desc || null,
        categoryId: catId,
        linkedToGazetteer: linked,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-3 space-y-3">
      <div>
        <label className="block text-xs font-medium text-stm-warm-600 mb-1">
          Label
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-stm-warm-200 rounded bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stm-warm-600 mb-1">
          Description
        </label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={2}
          className="w-full px-3 py-1.5 text-sm border border-stm-warm-200 rounded bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none resize-y"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-stm-warm-600 mb-1">
            Category
          </label>
          <select
            value={catId}
            onChange={(e) => setCatId(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-stm-warm-200 rounded bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none"
          >
            {categories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.prefLabel}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-stm-warm-700 cursor-pointer pb-1.5">
            <input
              type="checkbox"
              checked={linked}
              onChange={(e) => setLinked(e.target.checked)}
              className="rounded border-stm-warm-300 text-stm-teal-600 focus:ring-stm-sepia-400"
            />
            Linked to gazetteer
          </label>
        </div>
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
          {error}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={saving || !label.trim()}
          className="px-3 py-1.5 text-xs font-medium bg-stm-sepia-600 text-white rounded hover:bg-stm-sepia-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save to GitHub'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 text-xs text-stm-warm-600 border border-stm-warm-200 rounded hover:bg-stm-warm-50 transition-colors"
        >
          Cancel
        </button>
      </div>
      <p className="text-[10px] text-stm-warm-400">
        Source ID: <span className="font-mono">{source.sourceId}</span>{' '}
        (immutable)
      </p>
    </div>
  );
}

/* Form for adding a brand new source */
function SourceForm({
  categories,
  onSave,
  onCancel,
}: {
  categories: SourceCategory[];
  onSave: (data: {
    sourceId: string;
    prefLabel: string;
    description: string | null;
    categoryId: string;
    linkedToGazetteer: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('');
  const [desc, setDesc] = useState('');
  const [catId, setCatId] = useState(categories[0]?.categoryId || 'map');
  const [linked, setLinked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        sourceId: '', // empty = auto-generate from label
        prefLabel: label,
        description: desc || null,
        categoryId: catId,
        linkedToGazetteer: linked,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-8 border border-stm-teal-200 bg-white rounded-lg shadow-sm p-5 space-y-3">
      <h3 className="text-sm font-semibold text-stm-warm-800">
        Add New Source
      </h3>
      <div>
        <label className="block text-xs font-medium text-stm-warm-600 mb-1">
          Label
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Generale Kaart van Suriname (1770)"
          className="w-full px-3 py-1.5 text-sm border border-stm-warm-200 rounded bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stm-warm-600 mb-1">
          Description
        </label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={2}
          placeholder="Brief description of this source..."
          className="w-full px-3 py-1.5 text-sm border border-stm-warm-200 rounded bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none resize-y"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-stm-warm-600 mb-1">
            Category
          </label>
          <select
            value={catId}
            onChange={(e) => setCatId(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-stm-warm-200 rounded bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none"
          >
            {categories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.prefLabel}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-stm-warm-700 cursor-pointer pb-1.5">
            <input
              type="checkbox"
              checked={linked}
              onChange={(e) => setLinked(e.target.checked)}
              className="rounded border-stm-warm-300 text-stm-teal-600 focus:ring-stm-sepia-400"
            />
            Linked to gazetteer
          </label>
        </div>
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
          {error}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={saving || !label.trim()}
          className="px-3 py-1.5 text-sm font-medium bg-stm-teal-600 text-white rounded hover:bg-stm-teal-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Add Source'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 text-sm text-stm-warm-600 border border-stm-warm-200 rounded hover:bg-stm-warm-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
