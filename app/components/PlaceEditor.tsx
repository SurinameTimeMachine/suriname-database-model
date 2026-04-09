'use client';

import { getSourcesByCategory, useSourceRegistry } from '@/lib/sources';
import { usePlaceTypes } from '@/lib/thesaurus';
import type {
  DiklandRef,
  ExternalLink,
  GazetteerPlace,
  SkosMatchType,
} from '@/lib/types';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';

const PlaceMiniMap = dynamic(() => import('./PlaceMiniMap'), { ssr: false });

interface PlaceEditorProps {
  place: GazetteerPlace;
  districts: GazetteerPlace[];
  canEdit: boolean;
  onSave: (place: GazetteerPlace) => Promise<void>;
  onCancel: () => void;
  onDelete?: (id: string) => Promise<void>;
}

const CATEGORY_ORDER = [
  'map',
  'register',
  'almanac',
  'dataset',
  'external',
  'research-collection',
];

const DIKLAND_COLLECTION_URL =
  'https://drive.google.com/drive/u/0/folders/0B88mZFitv8embmZaYWFQNnZacDQ?tid=0B88mZFitv8emcjVfcG5hWFJOdWs&resourcekey=0-sImlF_DkEFu3ebWbDQ58Kg';

const AUTHORITIES: {
  id: string;
  label: string;
  uriTemplate: string;
  placeholder: string;
}[] = [
  {
    id: 'wikidata',
    label: 'Wikidata',
    uriTemplate: 'https://www.wikidata.org/entity/{id}',
    placeholder: 'e.g. Q59132846',
  },
  {
    id: 'tgn',
    label: 'Getty TGN',
    uriTemplate: 'http://vocab.getty.edu/tgn/{id}',
    placeholder: 'e.g. 7005564',
  },
  {
    id: 'geonames',
    label: 'GeoNames',
    uriTemplate: 'https://sws.geonames.org/{id}/',
    placeholder: 'e.g. 3383330',
  },
];

const MATCH_TYPES: {
  value: SkosMatchType;
  label: string;
  description: string;
}[] = [
  {
    value: 'exactMatch',
    label: 'Exact',
    description: 'Same place, interchangeable',
  },
  {
    value: 'closeMatch',
    label: 'Close',
    description: 'Very similar, not identical',
  },
  {
    value: 'broadMatch',
    label: 'Broad',
    description: 'External concept is broader',
  },
  {
    value: 'narrowMatch',
    label: 'Narrow',
    description: 'External concept is more specific',
  },
  {
    value: 'relatedMatch',
    label: 'Related',
    description: 'Associated but different concept',
  },
];

const MATCH_COLORS: Record<SkosMatchType, string> = {
  exactMatch: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  closeMatch: 'bg-sky-100 text-sky-700 border-sky-300',
  broadMatch: 'bg-amber-100 text-amber-700 border-amber-300',
  narrowMatch: 'bg-violet-100 text-violet-700 border-violet-300',
  relatedMatch: 'bg-stone-100 text-stone-600 border-stone-300',
};

function resolveUri(authority: string, identifier: string): string {
  const auth = AUTHORITIES.find((a) => a.id === authority);
  if (auth) return auth.uriTemplate.replace('{id}', identifier);
  // Custom URI: identifier is the full URI
  return identifier;
}

function authorityLabel(authority: string): string {
  const auth = AUTHORITIES.find((a) => a.id === authority);
  return auth ? auth.label : authority;
}

function ExternalLinkAdder({
  existingLinks,
  onAdd,
}: {
  existingLinks: ExternalLink[];
  onAdd: (link: ExternalLink) => void;
}) {
  const [open, setOpen] = useState(false);
  const [authority, setAuthority] = useState('wikidata');
  const [identifier, setIdentifier] = useState('');
  const [matchType, setMatchType] = useState<SkosMatchType>('closeMatch');
  const isCustom = !AUTHORITIES.find((a) => a.id === authority);
  const placeholder =
    AUTHORITIES.find((a) => a.id === authority)?.placeholder || 'Full URI';
  const isDuplicate = existingLinks.some(
    (l) => l.authority === authority && l.identifier === identifier,
  );

  const handleAdd = () => {
    if (!identifier.trim() || isDuplicate) return;
    onAdd({ authority, identifier: identifier.trim(), matchType });
    setIdentifier('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-stm-teal-600 hover:text-stm-teal-700 font-medium"
      >
        + Add link
      </button>
    );
  }

  return (
    <div className="border border-stm-warm-200 rounded p-2.5 bg-stm-warm-50 space-y-2">
      <div className="flex gap-2">
        <select
          value={authority}
          onChange={(e) => setAuthority(e.target.value)}
          className="px-2 py-1.5 text-xs border border-stm-warm-200 rounded bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none"
        >
          {AUTHORITIES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
          <option value="_custom">Custom URI</option>
        </select>
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={authority === '_custom' ? 'https://...' : placeholder}
          className={`flex-1 px-2 py-1.5 text-xs border border-stm-warm-200 rounded bg-white font-mono focus:ring-1 focus:ring-stm-sepia-400 outline-none ${isDuplicate ? 'border-red-300' : ''}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-stm-warm-500 shrink-0">Match:</span>
        <select
          value={matchType}
          onChange={(e) => setMatchType(e.target.value as SkosMatchType)}
          className="px-2 py-1 text-[10px] border border-stm-warm-200 rounded bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none"
        >
          {MATCH_TYPES.map((mt) => (
            <option key={mt.value} value={mt.value}>
              {mt.label} -- {mt.description}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!identifier.trim() || isDuplicate}
          className="px-2.5 py-1 text-xs font-medium bg-stm-teal-600 text-white rounded hover:bg-stm-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setIdentifier('');
          }}
          className="px-2.5 py-1 text-xs text-stm-warm-500 hover:text-stm-warm-700"
        >
          Cancel
        </button>
      </div>
      {isDuplicate && (
        <p className="text-[10px] text-red-500">This link already exists.</p>
      )}
    </div>
  );
}

function DiklandRefAdder({ onAdd }: { onAdd: (ref: DiklandRef) => void }) {
  const [open, setOpen] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [driveUrl, setDriveUrl] = useState(DIKLAND_COLLECTION_URL);
  const [author, setAuthor] = useState('Philip Dikland');
  const [year, setYear] = useState('');
  const [notes, setNotes] = useState('');

  const handleAdd = () => {
    if (!folderPath.trim()) return;
    onAdd({
      folderPath: folderPath.trim(),
      driveUrl: driveUrl.trim() || DIKLAND_COLLECTION_URL,
      author: author.trim() || null,
      year: year.trim() || null,
      notes: notes.trim() || null,
    });
    setFolderPath('');
    setDriveUrl(DIKLAND_COLLECTION_URL);
    setAuthor('Philip Dikland');
    setYear('');
    setNotes('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-stm-teal-600 hover:text-stm-teal-700 font-medium"
      >
        + Add Dikland reference
      </button>
    );
  }

  return (
    <div className="border border-stm-warm-200 rounded p-2.5 bg-stm-warm-50 space-y-2">
      <div>
        <span className="text-[10px] text-stm-warm-500">
          Folder path (required)
        </span>
        <input
          type="text"
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          placeholder="e.g. erfgoed - geschiedenis/Suriname rivier/plantages/Voorburg 2004-01 geschiedenis.pdf"
          className="w-full mt-0.5 px-2 py-1.5 text-xs border border-stm-warm-200 rounded bg-white font-mono focus:ring-1 focus:ring-stm-sepia-400 outline-none"
        />
      </div>
      <div>
        <span className="text-[10px] text-stm-warm-500">Drive URL</span>
        <input
          type="text"
          value={driveUrl}
          onChange={(e) => setDriveUrl(e.target.value)}
          placeholder="https://drive.google.com/..."
          className="w-full mt-0.5 px-2 py-1.5 text-xs border border-stm-warm-200 rounded bg-white font-mono focus:ring-1 focus:ring-stm-sepia-400 outline-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-[10px] text-stm-warm-500">Author</span>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Philip Dikland"
            className="w-full mt-0.5 px-2 py-1.5 text-xs border border-stm-warm-200 rounded bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none"
          />
        </div>
        <div>
          <span className="text-[10px] text-stm-warm-500">Year</span>
          <input
            type="text"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="e.g. 2004"
            className="w-full mt-0.5 px-2 py-1.5 text-xs border border-stm-warm-200 rounded bg-white font-mono focus:ring-1 focus:ring-stm-sepia-400 outline-none"
          />
        </div>
      </div>
      <div>
        <span className="text-[10px] text-stm-warm-500">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Alt labels, chronology highlights, transcribed quotes…"
          className="w-full mt-0.5 px-2 py-1.5 text-xs border border-stm-warm-200 rounded bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none resize-y"
        />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={handleAdd}
          disabled={!folderPath.trim()}
          className="px-2.5 py-1 text-xs font-medium bg-stm-teal-600 text-white rounded hover:bg-stm-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setFolderPath('');
          }}
          className="px-2.5 py-1 text-xs text-stm-warm-500 hover:text-stm-warm-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function PlaceEditor({
  place,
  districts,
  canEdit,
  onSave,
  onCancel,
  onDelete,
}: PlaceEditorProps) {
  const { labels, crmBadges, biasTypes, allTypes } = usePlaceTypes();
  const { sources: registrySources, categories: registryCategories } =
    useSourceRegistry();
  const sourcesByCategory = useMemo(
    () => getSourcesByCategory(registrySources, registryCategories),
    [registrySources, registryCategories],
  );
  const sortedCategories = useMemo(
    () =>
      [...registryCategories].sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.categoryId);
        const bi = CATEGORY_ORDER.indexOf(b.categoryId);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }),
    [registryCategories],
  );
  const [draft, setDraft] = useState<GazetteerPlace>({ ...place });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altLabelInput, setAltLabelInput] = useState(
    place.altLabels.join(', '),
  );
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const diklandRefs: DiklandRef[] = draft.diklandRefs ?? [];

  const update = <K extends keyof GazetteerPlace>(
    key: K,
    value: GazetteerPlace[K],
  ) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const updateLocation = (
    key: keyof GazetteerPlace['location'],
    value: string | number | null,
  ) => {
    setDraft((d) => ({
      ...d,
      location: { ...d.location, [key]: value },
    }));
  };

  const handleLocationChange = useCallback((lat: number, lng: number) => {
    setDraft((d) => ({
      ...d,
      location: { ...d.location, lat, lng },
    }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Parse alt labels from comma-separated input
      const altLabels = altLabelInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await onSave({ ...draft, altLabels });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSourceToggle = (source: string) => {
    const sources = draft.sources.includes(source)
      ? draft.sources.filter((s) => s !== source)
      : [...draft.sources, source];
    update('sources', sources);
  };

  return (
    <div className="bg-white border border-stm-warm-200 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-stm-warm-100">
        <h3 className="text-lg font-serif font-bold text-stm-warm-800">
          {place.modifiedAt ? 'Edit Place' : 'New Place'}
        </h3>
        <button
          onClick={onCancel}
          className="text-stm-warm-400 hover:text-stm-warm-600 text-xl leading-none"
          title="Close"
        >
          x
        </button>
      </div>

      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Preferred Label */}
        <div>
          <label className="block text-sm font-medium text-stm-warm-700 mb-1">
            Preferred Label
          </label>
          <input
            type="text"
            value={draft.prefLabel}
            onChange={(e) => update('prefLabel', e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-stm-warm-200 rounded text-sm bg-white focus:ring-2 focus:ring-stm-sepia-400 focus:border-stm-sepia-400 outline-none disabled:bg-stm-warm-50 disabled:text-stm-warm-400"
          />
        </div>

        {/* Alternative Labels */}
        <div>
          <label className="block text-sm font-medium text-stm-warm-700 mb-1">
            Alternative Labels
            <span className="text-stm-warm-400 font-normal">
              {' '}
              (comma-separated)
            </span>
          </label>
          <input
            type="text"
            value={altLabelInput}
            onChange={(e) => setAltLabelInput(e.target.value)}
            disabled={!canEdit}
            placeholder="e.g. Geyers-Vlijt, Geyersvlijt"
            className="w-full px-3 py-2 border border-stm-warm-200 rounded text-sm bg-white focus:ring-2 focus:ring-stm-sepia-400 focus:border-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
          />
        </div>

        {/* Type + District row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-stm-warm-700 mb-1">
              Type
            </label>
            <select
              value={draft.type}
              onChange={(e) =>
                update('type', e.target.value as GazetteerPlace['type'])
              }
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-stm-warm-200 rounded text-sm bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
            >
              {allTypes.map((t) => {
                const label = labels[t] || t;
                const badge = crmBadges[t] || '';
                return (
                  <option key={t} value={t}>
                    {label} ({badge})
                  </option>
                );
              })}
            </select>
            {biasTypes[draft.type] && (
              <p className="mt-1 text-[10px] text-amber-600">
                {biasTypes[draft.type].editorialNote}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-stm-warm-700 mb-1">
              Part of (District)
            </label>
            <select
              value={draft.broader || ''}
              onChange={(e) => update('broader', e.target.value || null)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-stm-warm-200 rounded text-sm bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
            >
              <option value="">-- None --</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.prefLabel}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-stm-warm-700 mb-1">
            Description
          </label>
          <textarea
            value={draft.description}
            onChange={(e) => update('description', e.target.value)}
            disabled={!canEdit}
            rows={2}
            className="w-full px-3 py-2 border border-stm-warm-200 rounded text-sm bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none resize-y disabled:bg-stm-warm-50"
          />
        </div>

        {/* Coordinates */}
        <div>
          <label className="block text-sm font-medium text-stm-warm-700 mb-1">
            Coordinates
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-xs text-stm-warm-400">Latitude</span>
              <input
                type="number"
                step="any"
                value={draft.location.lat ?? ''}
                onChange={(e) =>
                  updateLocation(
                    'lat',
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                disabled={!canEdit}
                className="w-full px-2 py-1.5 border border-stm-warm-200 rounded text-sm font-mono bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
              />
            </div>
            <div>
              <span className="text-xs text-stm-warm-400">Longitude</span>
              <input
                type="number"
                step="any"
                value={draft.location.lng ?? ''}
                onChange={(e) =>
                  updateLocation(
                    'lng',
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                disabled={!canEdit}
                className="w-full px-2 py-1.5 border border-stm-warm-200 rounded text-sm font-mono bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
              />
            </div>
            <div>
              <span className="text-xs text-stm-warm-400">CRS</span>
              <input
                type="text"
                value={draft.location.crs}
                onChange={(e) => updateLocation('crs', e.target.value)}
                disabled={!canEdit}
                className="w-full px-2 py-1.5 border border-stm-warm-200 rounded text-sm font-mono bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
              />
            </div>
          </div>
        </div>

        {/* Mini Map */}
        <div>
          <label className="block text-sm font-medium text-stm-warm-700 mb-1">
            Map Preview
            {canEdit && (
              <span className="text-stm-warm-400 font-normal">
                {' '}
                (click to set location)
              </span>
            )}
          </label>
          <PlaceMiniMap
            lat={draft.location.lat}
            lng={draft.location.lng}
            wkt={draft.location.wkt}
            editable={canEdit}
            onLocationChange={handleLocationChange}
          />
        </div>

        {/* External Links */}
        <div>
          <label className="block text-sm font-medium text-stm-warm-700 mb-1">
            External Links
            <span className="text-stm-warm-400 font-normal text-xs ml-1">
              (LOD authority links with match closeness)
            </span>
          </label>

          {/* Existing links */}
          {(draft.externalLinks || []).length > 0 && (
            <div className="space-y-1.5 mb-2">
              {(draft.externalLinks || []).map((link, i) => (
                <div
                  key={`${link.authority}-${link.identifier}`}
                  className="flex items-center gap-2 px-2.5 py-1.5 border border-stm-warm-200 rounded bg-white text-sm"
                >
                  <span className="text-stm-warm-500 font-medium text-xs w-16 shrink-0">
                    {authorityLabel(link.authority)}
                  </span>
                  <span className="font-mono text-stm-warm-700 text-xs flex-1 truncate">
                    {link.identifier}
                  </span>
                  {canEdit ? (
                    <select
                      value={link.matchType}
                      onChange={(e) => {
                        const links = [...(draft.externalLinks || [])];
                        links[i] = {
                          ...links[i],
                          matchType: e.target.value as SkosMatchType,
                        };
                        update('externalLinks', links);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none"
                    >
                      {MATCH_TYPES.map((mt) => (
                        <option key={mt.value} value={mt.value}>
                          {mt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${MATCH_COLORS[link.matchType]}`}
                      title={
                        MATCH_TYPES.find((m) => m.value === link.matchType)
                          ?.description
                      }
                    >
                      {
                        MATCH_TYPES.find((m) => m.value === link.matchType)
                          ?.label
                      }
                    </span>
                  )}
                  <a
                    href={resolveUri(link.authority, link.identifier)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-stm-teal-600 hover:text-stm-teal-700 text-xs shrink-0"
                    title="Open in new tab"
                  >
                    View
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        const links = (draft.externalLinks || []).filter(
                          (_, j) => j !== i,
                        );
                        update('externalLinks', links);
                      }}
                      className="text-stm-warm-400 hover:text-red-500 text-xs shrink-0"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add new link form */}
          {canEdit && (
            <ExternalLinkAdder
              existingLinks={draft.externalLinks || []}
              onAdd={(link) =>
                update('externalLinks', [...(draft.externalLinks || []), link])
              }
            />
          )}

          {!canEdit && (draft.externalLinks || []).length === 0 && (
            <p className="text-xs text-stm-warm-400 italic">
              No external links
            </p>
          )}

          {/* Match type legend */}
          <details className="mt-2">
            <summary className="text-[10px] text-stm-warm-400 cursor-pointer hover:text-stm-warm-500">
              Match type definitions
            </summary>
            <div className="mt-1 space-y-0.5">
              {MATCH_TYPES.map((mt) => (
                <div
                  key={mt.value}
                  className="flex items-center gap-2 text-[10px]"
                >
                  <span
                    className={`px-1.5 py-0.5 rounded border font-medium ${MATCH_COLORS[mt.value]}`}
                  >
                    {mt.label}
                  </span>
                  <span className="text-stm-warm-500">{mt.description}</span>
                </div>
              ))}
            </div>
          </details>
        </div>

        {/* Dikland Collection */}
        <div>
          <label className="block text-sm font-medium text-stm-warm-700 mb-1">
            Dikland Collection
            <span className="text-stm-warm-400 font-normal text-xs ml-1">
              (Suriname Heritage Guide plantation descriptions)
            </span>
          </label>

          {diklandRefs.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {diklandRefs.map((ref, i) => (
                <details
                  key={i}
                  className="border border-stm-warm-200 rounded bg-white"
                >
                  <summary className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer list-none">
                    {ref.year && (
                      <span className="text-[10px] font-mono text-stm-warm-400 shrink-0">
                        {ref.year}
                      </span>
                    )}
                    <span className="text-xs text-stm-warm-700 flex-1 truncate font-mono">
                      {ref.folderPath.split('/').pop()}
                    </span>
                    <a
                      href={ref.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stm-teal-600 hover:text-stm-teal-700 text-xs shrink-0"
                      title="Open in Google Drive"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open
                    </a>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          update(
                            'diklandRefs',
                            diklandRefs.filter((_, j) => j !== i),
                          );
                        }}
                        className="text-stm-warm-400 hover:text-red-500 text-xs shrink-0"
                      >
                        x
                      </button>
                    )}
                  </summary>
                  <div className="px-2.5 pb-2 pt-1 space-y-1 border-t border-stm-warm-100">
                    <p className="text-[10px] text-stm-warm-500 font-mono break-all">
                      {ref.folderPath}
                    </p>
                    {ref.author && (
                      <p className="text-[10px] text-stm-warm-500">
                        {ref.author}
                        {ref.year ? `, ${ref.year}` : ''}
                      </p>
                    )}
                    {ref.notes && (
                      <p className="text-[10px] text-stm-warm-600 italic">
                        {ref.notes}
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}

          {canEdit && (
            <DiklandRefAdder
              onAdd={(ref) => update('diklandRefs', [...diklandRefs, ref])}
            />
          )}

          {!canEdit && diklandRefs.length === 0 && (
            <p className="text-xs text-stm-warm-400 italic">
              No Dikland references
            </p>
          )}
        </div>

        {/* Sources */}
        <div>
          <label className="block text-sm font-medium text-stm-warm-700 mb-1">
            Sources
          </label>

          {/* Selected sources as removable pills */}
          {draft.sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {draft.sources.map((srcId) => {
                const src = registrySources.find((s) => s.sourceId === srcId);
                return (
                  <span
                    key={srcId}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-stm-sepia-100 border border-stm-sepia-300 text-stm-sepia-800"
                  >
                    {src ? src.prefLabel : srcId}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleSourceToggle(srcId)}
                        className="text-stm-sepia-500 hover:text-stm-sepia-800 ml-0.5 leading-none"
                      >
                        x
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {/* Dropdown trigger */}
          {canEdit && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSourceDropdownOpen(!sourceDropdownOpen)}
                className="w-full flex items-center justify-between px-3 py-2 border border-stm-warm-200 rounded text-sm bg-white hover:border-stm-warm-300 transition-colors text-left"
              >
                <span className="text-stm-warm-400">
                  {draft.sources.length === 0
                    ? 'Select sources...'
                    : `${draft.sources.length} source${draft.sources.length !== 1 ? 's' : ''} selected`}
                </span>
                <svg
                  className={`w-4 h-4 text-stm-warm-400 transition-transform ${sourceDropdownOpen ? 'rotate-180' : ''}`}
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

              {sourceDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-stm-warm-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {sortedCategories.map((cat) => {
                    const catSources = sourcesByCategory.get(cat.id) || [];
                    if (catSources.length === 0) return null;
                    return (
                      <div key={cat.id}>
                        <div className="px-3 py-1.5 bg-stm-warm-50 border-b border-stm-warm-100 sticky top-0">
                          <span className="text-[10px] text-stm-warm-400 uppercase tracking-wide font-medium">
                            {cat.prefLabel}
                          </span>
                        </div>
                        {catSources.map((src) => {
                          const isSelected = draft.sources.includes(
                            src.sourceId,
                          );
                          return (
                            <button
                              key={src.sourceId}
                              type="button"
                              onClick={() => handleSourceToggle(src.sourceId)}
                              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-stm-warm-50 transition-colors ${
                                isSelected
                                  ? 'text-stm-sepia-800 font-medium'
                                  : 'text-stm-warm-600'
                              }`}
                            >
                              <span
                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                  isSelected
                                    ? 'bg-stm-sepia-600 border-stm-sepia-600'
                                    : 'border-stm-warm-300'
                                }`}
                              >
                                {isSelected && (
                                  <svg
                                    className="w-2.5 h-2.5 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={4}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </span>
                              <span className="flex-1 truncate">
                                {src.prefLabel}
                              </span>
                              {src.mapYear && (
                                <span className="text-[10px] text-stm-warm-400 font-mono shrink-0">
                                  {src.mapYear}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Read-only: just show pills */}
          {!canEdit && draft.sources.length === 0 && (
            <p className="text-xs text-stm-warm-400 italic">
              No sources assigned
            </p>
          )}
        </div>

        {/* PSUR IDs */}
        <div>
          <label className="block text-sm font-medium text-stm-warm-700 mb-1">
            PSUR IDs
            <span className="text-stm-warm-400 font-normal">
              {' '}
              (comma-separated)
            </span>
          </label>
          <input
            type="text"
            value={(draft.psurIds || []).join(', ')}
            onChange={(e) =>
              update(
                'psurIds',
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            disabled={!canEdit}
            placeholder="e.g. PSUR0041, PSUR0118"
            className="w-full px-3 py-2 border border-stm-warm-200 rounded text-sm font-mono bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
          />
        </div>

        {/* Location Description + Original + Place Type */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-stm-warm-700 mb-1">
                Location
                <span className="text-stm-warm-400 font-normal">
                  {' '}
                  (standardized)
                </span>
              </label>
              <input
                type="text"
                value={draft.locationDescription || ''}
                onChange={(e) =>
                  update('locationDescription', e.target.value || null)
                }
                disabled={!canEdit}
                placeholder="e.g. Suriname"
                className="w-full px-3 py-2 border border-stm-warm-200 rounded text-sm bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stm-warm-700 mb-1">
                Place Type / Product
              </label>
              <input
                type="text"
                value={draft.placeType || ''}
                onChange={(e) => update('placeType', e.target.value || null)}
                disabled={!canEdit}
                placeholder="e.g. koffie, suiker"
                className="w-full px-3 py-2 border border-stm-warm-200 rounded text-sm bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stm-warm-700 mb-1">
              Location Description
              <span className="text-stm-warm-400 font-normal">
                {' '}
                (original from source)
              </span>
            </label>
            <input
              type="text"
              value={draft.locationDescriptionOriginal || ''}
              onChange={(e) =>
                update('locationDescriptionOriginal', e.target.value || null)
              }
              disabled={!canEdit}
              placeholder="e.g. Rivier Suriname, regterhand"
              className="w-full px-3 py-2 border border-stm-warm-200 rounded text-sm bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
            />
          </div>
        </div>

        {/* IDs (read-only) */}
        <div className="space-y-1 text-xs text-stm-warm-400">
          <div>
            Gazetteer ID: <span className="font-mono">{draft.id}</span>
          </div>
          {draft.fid != null && <div>QGIS Feature ID: {draft.fid}</div>}
          {draft.district && (
            <div>District (auto-linked): {draft.district}</div>
          )}
        </div>

        {/* Metadata */}
        {draft.modifiedBy && (
          <div className="text-xs text-stm-warm-400">
            Last modified by {draft.modifiedBy} on {draft.modifiedAt}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {error}
          </div>
        )}

        {/* Actions */}
        {canEdit && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !draft.prefLabel.trim()}
              className="px-4 py-2 bg-stm-sepia-600 text-white text-sm font-medium rounded hover:bg-stm-sepia-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save to GitHub'}
            </button>
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 text-stm-warm-600 text-sm border border-stm-warm-200 rounded hover:bg-stm-warm-50 transition-colors"
            >
              Cancel
            </button>
            {onDelete && !place.id.startsWith('stm-new-') && (
              <button
                onClick={() => {
                  if (
                    confirm(
                      `Delete "${draft.prefLabel}"? This cannot be undone.`,
                    )
                  ) {
                    onDelete(place.id);
                  }
                }}
                disabled={saving}
                className="px-4 py-2 text-red-600 text-sm border border-red-200 rounded hover:bg-red-50 transition-colors ml-auto"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
