'use client';

import type { GazetteerPlace } from '@/lib/types';
import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';

const PlaceMiniMap = dynamic(() => import('./PlaceMiniMap'), { ssr: false });

interface PlaceEditorProps {
  place: GazetteerPlace;
  districts: GazetteerPlace[];
  canEdit: boolean;
  onSave: (place: GazetteerPlace) => Promise<void>;
  onCancel: () => void;
}

const PLACE_TYPES: GazetteerPlace['type'][] = [
  'plantation',
  'district',
  'river',
  'settlement',
];

const SOURCE_OPTIONS = [
  'map-1930',
  'almanakken',
  'slave-registers',
  'wikidata',
  'ward-registers',
];

export default function PlaceEditor({
  place,
  districts,
  canEdit,
  onSave,
  onCancel,
}: PlaceEditorProps) {
  const [draft, setDraft] = useState<GazetteerPlace>({ ...place });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altLabelInput, setAltLabelInput] = useState(
    place.altLabels.join(', '),
  );

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
              {PLACE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
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

        {/* Wikidata Q-ID */}
        <div>
          <label className="block text-sm font-medium text-stm-warm-700 mb-1">
            Wikidata Q-ID
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draft.wikidataQid || ''}
              onChange={(e) => update('wikidataQid', e.target.value || null)}
              disabled={!canEdit}
              placeholder="e.g. Q59132846"
              className="flex-1 px-3 py-2 border border-stm-warm-200 rounded text-sm font-mono bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
            />
            {draft.wikidataQid && (
              <a
                href={`https://www.wikidata.org/wiki/${draft.wikidataQid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-stm-teal-600 hover:text-stm-teal-700 text-sm underline shrink-0"
              >
                View on Wikidata
              </a>
            )}
          </div>
        </div>

        {/* Sources */}
        <div>
          <label className="block text-sm font-medium text-stm-warm-700 mb-1">
            Sources
          </label>
          <div className="flex flex-wrap gap-2">
            {SOURCE_OPTIONS.map((src) => (
              <label
                key={src}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border cursor-pointer transition-colors ${
                  draft.sources.includes(src)
                    ? 'bg-stm-sepia-100 border-stm-sepia-300 text-stm-sepia-800'
                    : 'bg-white border-stm-warm-200 text-stm-warm-500 hover:border-stm-warm-300'
                } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={draft.sources.includes(src)}
                  onChange={() => handleSourceToggle(src)}
                  disabled={!canEdit}
                  className="sr-only"
                />
                {src}
              </label>
            ))}
          </div>
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

        {/* Location Description + Place Type row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-stm-warm-700 mb-1">
              Location Description
            </label>
            <input
              type="text"
              value={draft.locationDescription || ''}
              onChange={(e) =>
                update('locationDescription', e.target.value || null)
              }
              disabled={!canEdit}
              placeholder="e.g. Suriname, regterhand"
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
          </div>
        )}
      </div>
    </div>
  );
}
