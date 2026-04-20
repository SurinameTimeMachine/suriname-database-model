'use client';

import PlaceEditor from '@/components/PlaceEditor';
import SourceFilter, {
  emptyFilterState,
  type SourceFilterState,
} from '@/components/SourceFilter';
import { useAuth } from '@/lib/auth';
import { getActiveSources, useSourceRegistry } from '@/lib/sources';
import { usePlaceTypes } from '@/lib/thesaurus';
import type { GazetteerPlace } from '@/lib/types';
import { getPreferredName } from '@/lib/types';
import { useSearchParams } from 'next/navigation';
import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type SortKey =
  | 'name'
  | 'type'
  | 'district'
  | 'psurIds'
  | 'externalLinks'
  | 'wikidata'
  | 'dikland'
  | 'placeType'
  | 'lat'
  | 'modifiedAt'
  | 'map1930'
  | 'almanakken';
type SortDir = 'asc' | 'desc';

function emptyPlace(): GazetteerPlace {
  return {
    id: `stm-new-${Date.now()}`,
    type: 'settlement',
    names: [],
    broader: null,
    description: '',
    location: { lat: null, lng: null, wkt: null, crs: 'EPSG:4326' },
    sources: [],
    wikidataQid: null,
    externalLinks: [],
    fid: null,
    psurIds: [],
    district: null,
    locationDescription: null,
    locationDescriptionOriginal: null,
    placeType: null,
    diklandRefs: [],
    modifiedBy: null,
    modifiedAt: null,
  };
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-stm-warm-200 ml-0.5">&#8597;</span>;
  return (
    <span className="text-stm-sepia-600 ml-0.5">
      {dir === 'asc' ? '\u2191' : '\u2193'}
    </span>
  );
}

interface PlaceRowProps {
  place: GazetteerPlace;
  isSelected: boolean;
  onSelect: (id: string) => void;
  colors: Record<string, string>;
  labels: Record<string, string>;
}

const PlaceRow = memo(function PlaceRow({
  place,
  isSelected,
  onSelect,
  colors,
  labels,
}: PlaceRowProps) {
  const handleClick = useCallback(
    () => onSelect(place.id),
    [onSelect, place.id],
  );
  const altNames = place.names.filter((n) => !n.isPreferred);

  return (
    <tr
      onClick={handleClick}
      className={`cursor-pointer border-b border-stm-warm-50 transition-colors ${
        isSelected ? 'bg-stm-sepia-50' : 'bg-white hover:bg-stm-warm-50'
      }`}
    >
      {/* Name */}
      <td className="py-1.5 px-2 font-medium text-stm-warm-800 max-w-55 truncate">
        {getPreferredName(place)}
        {altNames.length > 0 && (
          <span className="text-[11px] text-stm-warm-400 ml-1 font-normal hidden xl:inline">
            (
            {altNames
              .slice(0, 2)
              .map((n) => n.text)
              .join(', ')}
            )
          </span>
        )}
      </td>

      {/* Type */}
      <td className="py-1.5 px-2">
        <span
          className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded"
          style={{
            backgroundColor: (colors[place.type] || '#888') + '20',
            color: colors[place.type] || '#888',
          }}
        >
          {labels[place.type] || place.type}
        </span>
      </td>

      {/* District */}
      <td className="py-1.5 px-2 text-stm-warm-600 max-w-35 truncate">
        {place.district ?? <span className="text-stm-warm-200">--</span>}
      </td>

      {/* Product / Type */}
      <td className="py-1.5 px-2 text-stm-warm-500 text-xs max-w-30 truncate hidden 2xl:table-cell">
        {place.placeType ?? <span className="text-stm-warm-200">--</span>}
      </td>

      {/* PSUR */}
      <td className="py-1.5 px-2 text-stm-warm-500 font-mono text-xs">
        {place.psurIds.length > 0 ? (
          place.psurIds.join(', ')
        ) : (
          <span className="text-stm-warm-200">--</span>
        )}
      </td>

      {/* External Links */}
      <td className="py-1.5 px-2 text-center">
        {(place.externalLinks || []).length > 0 ? (
          <span
            className="inline-block min-w-5 px-1 py-0.5 text-[10px] font-medium rounded bg-stm-teal-100 text-stm-teal-700"
            title={(place.externalLinks || [])
              .map(
                (l) =>
                  `${l.authority}: ${l.identifier} (${l.matchType.replace('Match', '')})`,
              )
              .join('\n')}
          >
            {(place.externalLinks || []).length}
          </span>
        ) : (
          <span className="text-stm-warm-200">--</span>
        )}
      </td>

      {/* Wikidata */}
      <td className="py-1.5 px-2 text-center">
        {(place.externalLinks || []).some((l) => l.authority === 'wikidata') ? (
          <span
            className="text-stm-teal-600"
            title={
              (place.externalLinks || [])
                .filter((l) => l.authority === 'wikidata')
                .map((l) => l.identifier)
                .join(', ') || undefined
            }
          >
            &#10003;
          </span>
        ) : (
          <span className="text-stm-warm-200">-</span>
        )}
      </td>

      {/* Dikland */}
      <td className="py-1.5 px-2 text-center">
        {(place.diklandRefs || []).length > 0 ? (
          <span
            className="text-stm-sepia-500"
            title={`${place.diklandRefs.length} Dikland ref${place.diklandRefs.length > 1 ? 's' : ''}`}
          >
            &#10003;
          </span>
        ) : (
          <span className="text-stm-warm-200">-</span>
        )}
      </td>

      {/* Coords */}
      <td className="py-1.5 px-2 text-stm-warm-400 font-mono text-xs whitespace-nowrap">
        {place.location.lat != null ? (
          <>
            {place.location.lat.toFixed(2)}, {place.location.lng?.toFixed(2)}
          </>
        ) : (
          <span className="text-stm-warm-200">--</span>
        )}
      </td>

      {/* Modified */}
      <td className="py-1.5 px-2 text-stm-warm-400 text-xs whitespace-nowrap hidden 2xl:table-cell">
        {place.modifiedAt ? (
          new Date(place.modifiedAt).toLocaleDateString()
        ) : (
          <span className="text-stm-warm-200">--</span>
        )}
      </td>

      {/* Map 1930 */}
      <td className="py-1.5 px-2 text-center">
        {place.sources.includes('map-1930') ? (
          <span className="text-stm-sepia-500" title="In Map 1930">
            &#10003;
          </span>
        ) : (
          <span className="text-stm-warm-200">-</span>
        )}
      </td>

      {/* Almanakken */}
      <td className="py-1.5 px-2 text-center">
        {place.sources.includes('almanakken') ? (
          <span className="text-stm-teal-600" title="In Almanakken">
            &#10003;
          </span>
        ) : (
          <span className="text-stm-warm-200">-</span>
        )}
      </td>
    </tr>
  );
});

export default function PlacesPage() {
  return (
    <Suspense>
      <PlacesPageInner />
    </Suspense>
  );
}

function PlacesPageInner() {
  const { labels, colors, allTypes } = usePlaceTypes();
  const typeFilters = useMemo(
    () => [
      { value: 'all', label: 'All' },
      ...allTypes.map((t) => ({
        value: t,
        label: labels[t] ? `${labels[t]}s` : t,
      })),
    ],
    [allTypes, labels],
  );
  const [places, setPlaces] = useState<GazetteerPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const { canEdit } = useAuth();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  // Selected place IDs — supports up to 2 for future compare/merge
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [sourceFilter, setSourceFilter] =
    useState<SourceFilterState>(emptyFilterState());

  // URL sync: read ?place= query param
  const searchParams = useSearchParams();
  const lastAppliedPlace = useRef<string | null>(null);
  const {
    sources: registrySources,
    categories: registryCategories,
    loading: registryLoading,
  } = useSourceRegistry();
  const activeRegistrySources = useMemo(
    () => getActiveSources(registrySources),
    [registrySources],
  );

  // Load gazetteer data
  useEffect(() => {
    fetch('/data/places-gazetteer.jsonld')
      .then((r) => r.json())
      .then((data) => {
        const entries: GazetteerPlace[] = data['@graph'] || data;
        if (!Array.isArray(entries)) return;
        // Normalize: guard against legacy entries that lack names[]
        setPlaces(
          entries.map((p) => ({
            ...p,
            names: Array.isArray(p.names) ? p.names : [],
          })),
        );
      })
      .finally(() => setLoading(false));
  }, []);

  // Initialize/update selection from URL ?place= param
  useEffect(() => {
    if (places.length === 0) return;
    const placeId = searchParams.get('place');
    if (placeId === lastAppliedPlace.current) return;
    lastAppliedPlace.current = placeId;
    if (placeId && places.some((p) => p.id === placeId)) {
      setSelectedIds([placeId]);
    }
  }, [places, searchParams]);

  // Sync selectedIds to URL as ?place= query param (skip transient stm-new-* IDs)
  const syncUrlToSelection = useCallback((ids: string[]) => {
    const persistIds = ids.filter((id) => !id.startsWith('stm-new-'));
    const params = new URLSearchParams(window.location.search);
    if (persistIds[0]) {
      params.set('place', persistIds[0]);
    } else {
      params.delete('place');
    }
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `/places?${qs}` : '/places');
  }, []);

  const toggleSort = useCallback(
    (key: SortKey) => {
      const boolKeys: SortKey[] = [
        'wikidata',
        'dikland',
        'map1930',
        'almanakken',
      ];
      if (key === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir(boolKeys.includes(key) ? 'desc' : 'asc');
      }
    },
    [sortKey],
  );

  const handleRowSelect = useCallback(
    (id: string) => {
      setSelectedIds([id]);
      setIsCreating(false);
      syncUrlToSelection([id]);
    },
    [syncUrlToSelection],
  );

  // Filter, search, and sort
  const filtered = useMemo(() => {
    let list = places;
    if (typeFilter !== 'all') {
      list = list.filter((p) => p.type === typeFilter);
    }
    // Source filter
    if (sourceFilter.selected.size > 0) {
      const selected = [...sourceFilter.selected];
      const matchFn = (p: GazetteerPlace) => {
        const check = (key: string) =>
          key === 'dikland-collection'
            ? (p.diklandRefs || []).length > 0
            : p.sources.includes(key);
        return sourceFilter.mode === 'and'
          ? selected.every(check)
          : selected.some(check);
      };
      if (sourceFilter.excludeMode) {
        list = list.filter((p) => !matchFn(p));
      } else {
        list = list.filter(matchFn);
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.names.some((n) => n.text.toLowerCase().includes(q)) ||
          p.id.toLowerCase().includes(q) ||
          (p.externalLinks || []).some(
            (l) =>
              l.identifier.toLowerCase().includes(q) ||
              l.authority.toLowerCase().includes(q),
          ) ||
          (p.district && p.district.toLowerCase().includes(q)) ||
          p.psurIds.some((id) => id.toLowerCase().includes(q)) ||
          (p.locationDescription &&
            p.locationDescription.toLowerCase().includes(q)),
      );
    }

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const cmp = (va: string | number | null, vb: string | number | null) => {
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number')
          return (va - vb) * dir;
        return String(va).localeCompare(String(vb)) * dir;
      };
      switch (sortKey) {
        case 'name':
          return cmp(getPreferredName(a), getPreferredName(b));
        case 'type':
          return cmp(a.type, b.type);
        case 'district':
          return cmp(a.district, b.district);
        case 'psurIds':
          return cmp(a.psurIds[0] ?? null, b.psurIds[0] ?? null);
        case 'externalLinks':
          return cmp(
            (a.externalLinks || []).length || null,
            (b.externalLinks || []).length || null,
          );
        case 'placeType':
          return cmp(a.placeType, b.placeType);
        case 'lat':
          return cmp(a.location.lat, b.location.lat);
        case 'modifiedAt':
          return cmp(a.modifiedAt, b.modifiedAt);
        case 'wikidata':
          return cmp(
            (a.externalLinks || []).some((l) => l.authority === 'wikidata')
              ? 1
              : 0,
            (b.externalLinks || []).some((l) => l.authority === 'wikidata')
              ? 1
              : 0,
          );
        case 'dikland':
          return cmp(
            (a.diklandRefs || []).length > 0 ? 1 : 0,
            (b.diklandRefs || []).length > 0 ? 1 : 0,
          );
        case 'map1930':
          return cmp(
            a.sources.includes('map-1930') ? 1 : 0,
            b.sources.includes('map-1930') ? 1 : 0,
          );
        case 'almanakken':
          return cmp(
            a.sources.includes('almanakken') ? 1 : 0,
            b.sources.includes('almanakken') ? 1 : 0,
          );
        default:
          return 0;
      }
    });
    return list;
  }, [places, typeFilter, search, sortKey, sortDir, sourceFilter]);

  const districts = useMemo(
    () => places.filter((p) => p.type === 'district'),
    [places],
  );

  // Derive the first selected place (single-panel for now)
  const selectedId = selectedIds[0] ?? null;

  const selectedPlace = useMemo(() => {
    if (isCreating) return emptyPlace();
    if (!selectedId) return null;
    return places.find((p) => p.id === selectedId) || null;
  }, [places, selectedId, isCreating]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: places.length };
    for (const p of places) counts[p.type] = (counts[p.type] || 0) + 1;
    return counts;
  }, [places]);

  const handleSave = useCallback(
    async (updated: GazetteerPlace) => {
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save');
      }
      // Use the server response which includes modifiedBy/modifiedAt set by the API
      if (!data.place?.modifiedBy || !data.place?.modifiedAt) {
        throw new Error('Server response missing modifiedBy/modifiedAt');
      }
      const saved: GazetteerPlace = data.place;
      // Update local state
      setPlaces((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setSelectedIds([saved.id]);
      setIsCreating(false);
      syncUrlToSelection([saved.id]);
    },
    [syncUrlToSelection],
  );

  const handleCancel = useCallback(() => {
    setSelectedIds([]);
    setIsCreating(false);
    syncUrlToSelection([]);
  }, [syncUrlToSelection]);

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await fetch('/api/places', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      setPlaces((prev) => prev.filter((p) => p.id !== id));
      setSelectedIds([]);
      setIsCreating(false);
      syncUrlToSelection([]);
    },
    [syncUrlToSelection],
  );

  // Keyboard: Escape closes editor
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCancel]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-stm-warm-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-stm-sepia-400 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-stm-warm-500 text-sm">Loading places...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-stm-warm-50 overflow-hidden">
      {/* Top bar: auth + tabs */}
      <div className="border-b border-stm-warm-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-serif font-bold text-stm-warm-800">
                Suriname Gazetteer
              </h1>
            </div>
          </div>
        </div>
      </div>

      <>
        {/* Search + filters */}
        <div className="border-b border-stm-warm-100 bg-white/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-48">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, district, PSUR ID..."
                  className="w-full pl-8 pr-8 py-1.5 text-sm border border-stm-warm-200 rounded bg-white focus:ring-2 focus:ring-stm-sepia-400 focus:border-stm-sepia-400 outline-none"
                />
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stm-warm-400 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="11" cy="11" r="8" strokeWidth="2" />
                  <path d="m21 21-4.35-4.35" strokeWidth="2" />
                </svg>
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-stm-warm-400 hover:text-stm-warm-600"
                    aria-label="Clear search"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M18 6 6 18M6 6l12 12"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {/* Type filter */}
              <div className="flex items-center gap-1.5 shrink-0">
                <label className="text-xs text-stm-warm-500 whitespace-nowrap">
                  Place type
                </label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="text-sm border border-stm-warm-200 rounded bg-white pl-2.5 pr-7 py-1.5 text-stm-warm-700 focus:ring-2 focus:ring-stm-sepia-400 focus:border-stm-sepia-400 outline-none cursor-pointer"
                >
                  {typeFilters.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label} ({typeCounts[value] ?? 0})
                    </option>
                  ))}
                </select>
              </div>

              {/* Source filter */}
              {!registryLoading && (
                <div className="border-l border-stm-warm-200 pl-3">
                  <SourceFilter
                    sources={activeRegistrySources}
                    categories={registryCategories}
                    value={sourceFilter}
                    onChange={setSourceFilter}
                  />
                </div>
              )}

              {/* Add button */}
              {canEdit && (
                <button
                  onClick={() => {
                    setIsCreating(true);
                    setSelectedIds([]);
                    syncUrlToSelection([]);
                  }}
                  className="px-3 py-1.5 text-sm font-medium bg-stm-teal-600 text-white rounded hover:bg-stm-teal-700 transition-colors shrink-0"
                >
                  + Add Place
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main content: table + editor */}
        <div className="flex-1 overflow-hidden flex">
          {/* Place table */}
          <div className="flex-1 overflow-auto">
            <div className="text-xs text-stm-warm-400 px-4 sm:px-6 lg:px-8 pt-2 pb-1 max-w-350 mx-auto">
              {filtered.length} of {places.length} places
            </div>

            <div className="px-4 sm:px-6 lg:px-8 pb-4 max-w-350 mx-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="text-left text-xs text-stm-warm-500 border-b border-stm-warm-200">
                    {(
                      [
                        ['name', 'Name', ''],
                        ['type', 'Type', ''],
                        ['district', 'District', ''],
                        [
                          'placeType',
                          'Product / Type',
                          'hidden 2xl:table-cell',
                        ],
                        ['psurIds', 'PSUR', ''],
                        ['externalLinks', 'Links', ''],
                        ['wikidata', 'WD', ''],
                        ['dikland', 'Dik.', ''],
                        ['lat', 'Coords', ''],
                        ['modifiedAt', 'Modified', 'hidden 2xl:table-cell'],
                        ['map1930', 'Map', ''],
                        ['almanakken', 'Alm.', ''],
                      ] as [SortKey, string, string][]
                    ).map(([key, label, extraClass]) => (
                      <th
                        key={key}
                        className={`py-2 px-2 font-medium cursor-pointer hover:text-stm-warm-700 select-none whitespace-nowrap ${extraClass}`}
                        onClick={() => toggleSort(key)}
                      >
                        {label}
                        <SortArrow active={sortKey === key} dir={sortDir} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((place) => (
                    <PlaceRow
                      key={place.id}
                      place={place}
                      isSelected={selectedIds.includes(place.id)}
                      onSelect={handleRowSelect}
                      colors={colors}
                      labels={labels}
                    />
                  ))}
                </tbody>
              </table>

              {filtered.length === 0 && (
                <p className="text-sm text-stm-warm-400 text-center py-8">
                  No places match your search.
                </p>
              )}
            </div>
          </div>

          {/* Editor panel — future: map over selectedIds for dual-panel compare/merge */}
          {selectedPlace && (
            <div className="w-[40%] min-w-105 max-w-160 shrink-0 border-l border-stm-warm-200 bg-stm-warm-50 overflow-y-auto">
              <PlaceEditor
                key={selectedPlace.id}
                place={selectedPlace}
                districts={districts}
                canEdit={canEdit}
                onSave={handleSave}
                onCancel={handleCancel}
                onDelete={canEdit ? handleDelete : undefined}
              />
            </div>
          )}
        </div>
      </>
    </div>
  );
}
