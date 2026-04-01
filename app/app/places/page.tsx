'use client';

import PlaceEditor from '@/components/PlaceEditor';
import type { GazetteerPlace } from '@/lib/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface AuthState {
  user: { login: string; avatar_url: string; name: string | null } | null;
  canEdit: boolean;
}

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'plantation', label: 'Plantations' },
  { value: 'district', label: 'Districts' },
  { value: 'river', label: 'Rivers' },
  { value: 'settlement', label: 'Settlements' },
] as const;

const TYPE_BADGE_COLORS: Record<string, string> = {
  plantation: 'bg-stm-sepia-100 text-stm-sepia-700',
  district: 'bg-stm-teal-100 text-stm-teal-700',
  river: 'bg-blue-100 text-blue-700',
  settlement: 'bg-amber-100 text-amber-700',
};

const DATASET_FILTERS = [
  { key: 'map-1930', label: 'Map 1930' },
  { key: 'almanakken', label: 'Almanakken' },
  { key: 'wikidata', label: 'Wikidata' },
] as const;

type DatasetKey = (typeof DATASET_FILTERS)[number]['key'];
type DatasetFilterMode = 'in' | 'not-in';

type SortKey =
  | 'prefLabel'
  | 'type'
  | 'district'
  | 'psurIds'
  | 'wikidataQid'
  | 'placeType'
  | 'lat'
  | 'modifiedAt';
type SortDir = 'asc' | 'desc';

function emptyPlace(): GazetteerPlace {
  return {
    id: `stm-new-${Date.now()}`,
    type: 'settlement',
    prefLabel: '',
    altLabels: [],
    broader: null,
    description: '',
    location: { lat: null, lng: null, wkt: null, crs: 'EPSG:4326' },
    sources: [],
    wikidataQid: null,
    fid: null,
    psurIds: [],
    district: null,
    locationDescription: null,
    placeType: null,
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

export default function PlacesPage() {
  const [places, setPlaces] = useState<GazetteerPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<AuthState>({ user: null, canEdit: false });
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('prefLabel');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [datasetFilters, setDatasetFilters] = useState<
    Map<DatasetKey, DatasetFilterMode>
  >(new Map());

  const toggleDatasetFilter = useCallback((key: DatasetKey) => {
    setDatasetFilters((prev) => {
      const next = new Map(prev);
      const current = next.get(key);
      if (!current) next.set(key, 'in');
      else if (current === 'in') next.set(key, 'not-in');
      else next.delete(key);
      return next;
    });
  }, []);

  // Load gazetteer data
  useEffect(() => {
    fetch('/data/places-gazetteer.json')
      .then((r) => r.json())
      .then(setPlaces)
      .finally(() => setLoading(false));
  }, []);

  // Check auth session
  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then(setAuth)
      .catch(() => {});
  }, []);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

  // Filter, search, and sort
  const filtered = useMemo(() => {
    let list = places;
    if (typeFilter !== 'all') {
      list = list.filter((p) => p.type === typeFilter);
    }
    // Dataset presence filters
    for (const [key, mode] of datasetFilters) {
      const hasDataset = (p: GazetteerPlace) =>
        key === 'wikidata' ? !!p.wikidataQid : p.sources.includes(key);
      if (mode === 'in') {
        list = list.filter(hasDataset);
      } else {
        list = list.filter((p) => !hasDataset(p));
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.prefLabel.toLowerCase().includes(q) ||
          p.altLabels.some((a) => a.toLowerCase().includes(q)) ||
          p.id.toLowerCase().includes(q) ||
          (p.wikidataQid && p.wikidataQid.toLowerCase().includes(q)) ||
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
        case 'prefLabel':
          return cmp(a.prefLabel, b.prefLabel);
        case 'type':
          return cmp(a.type, b.type);
        case 'district':
          return cmp(a.district, b.district);
        case 'psurIds':
          return cmp(a.psurIds[0] ?? null, b.psurIds[0] ?? null);
        case 'wikidataQid':
          return cmp(a.wikidataQid, b.wikidataQid);
        case 'placeType':
          return cmp(a.placeType, b.placeType);
        case 'lat':
          return cmp(a.location.lat, b.location.lat);
        case 'modifiedAt':
          return cmp(a.modifiedAt, b.modifiedAt);
        default:
          return 0;
      }
    });
    return list;
  }, [places, typeFilter, search, sortKey, sortDir, datasetFilters]);

  const districts = useMemo(
    () => places.filter((p) => p.type === 'district'),
    [places],
  );

  const selectedPlace = useMemo(() => {
    if (isCreating) return emptyPlace();
    if (!selectedId) return null;
    return places.find((p) => p.id === selectedId) || null;
  }, [places, selectedId, isCreating]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: places.length,
      plantation: 0,
      district: 0,
      river: 0,
      settlement: 0,
    };
    for (const p of places) counts[p.type] = (counts[p.type] || 0) + 1;
    return counts;
  }, [places]);

  const handleSave = useCallback(async (updated: GazetteerPlace) => {
    const res = await fetch('/api/places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save');
    }
    // Update local state
    setPlaces((prev) => {
      const idx = prev.findIndex((p) => p.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
    setSelectedId(updated.id);
    setIsCreating(false);
  }, []);

  const handleCancel = useCallback(() => {
    setSelectedId(null);
    setIsCreating(false);
  }, []);

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
      {/* Top bar: auth + search */}
      <div className="border-b border-stm-warm-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-serif font-bold text-stm-warm-800">
                Places Gazetteer
              </h1>
              <p className="text-sm text-stm-warm-500">
                {places.length} places -- authority list for Suriname locations
              </p>
            </div>

            {/* Auth */}
            <div className="flex items-center gap-3 shrink-0">
              {auth.user ? (
                <div className="flex items-center gap-2">
                  <img
                    src={auth.user.avatar_url}
                    alt={auth.user.login}
                    className="w-7 h-7 rounded-full"
                  />
                  <span className="text-sm text-stm-warm-600">
                    {auth.user.name || auth.user.login}
                  </span>
                  {auth.canEdit && (
                    <span className="text-xs bg-stm-teal-100 text-stm-teal-700 px-1.5 py-0.5 rounded">
                      Editor
                    </span>
                  )}
                  <a
                    href="/api/auth/logout"
                    className="text-xs text-stm-warm-400 hover:text-stm-warm-600 underline"
                  >
                    Sign out
                  </a>
                </div>
              ) : (
                <a
                  href="/api/auth/github"
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-stm-warm-800 text-white rounded hover:bg-stm-warm-700 transition-colors"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  Sign in with GitHub
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search + filters */}
      <div className="border-b border-stm-warm-100 bg-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search places..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-stm-warm-200 rounded bg-white focus:ring-2 focus:ring-stm-sepia-400 focus:border-stm-sepia-400 outline-none"
              />
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stm-warm-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8" strokeWidth="2" />
                <path d="m21 21-4.35-4.35" strokeWidth="2" />
              </svg>
            </div>

            {/* Type filter buttons */}
            <div className="flex gap-1">
              {TYPE_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setTypeFilter(value)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    typeFilter === value
                      ? 'bg-stm-sepia-600 text-white'
                      : 'bg-stm-warm-100 text-stm-warm-600 hover:bg-stm-warm-200'
                  }`}
                >
                  {label}
                  <span className="ml-1 opacity-60">{typeCounts[value]}</span>
                </button>
              ))}
            </div>

            {/* Dataset filter toggles */}
            <div className="flex gap-2 items-center border-l border-stm-warm-200 pl-3">
              <span className="text-[10px] text-stm-warm-400 uppercase tracking-wide">
                Data:
              </span>
              {DATASET_FILTERS.map(({ key, label }) => {
                const mode = datasetFilters.get(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleDatasetFilter(key)}
                    title={
                      !mode
                        ? `Click to show only places in ${label}`
                        : mode === 'in'
                          ? `Click to show only places NOT in ${label}`
                          : 'Click to clear filter'
                    }
                    className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded border transition-colors ${
                      mode === 'in'
                        ? 'bg-stm-teal-50 border-stm-teal-300 text-stm-teal-700 font-medium'
                        : mode === 'not-in'
                          ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                          : 'bg-white border-stm-warm-200 text-stm-warm-500 hover:border-stm-warm-300'
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-sm flex items-center justify-center text-white text-[8px] font-bold ${
                        mode === 'in'
                          ? 'bg-stm-teal-600'
                          : mode === 'not-in'
                            ? 'bg-red-500'
                            : 'bg-stm-warm-100'
                      }`}
                    >
                      {mode === 'in' && (
                        <svg
                          className="w-2 h-2"
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
                      {mode === 'not-in' && (
                        <svg
                          className="w-2 h-2"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={4}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      )}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Add button */}
            {auth.canEdit && (
              <button
                onClick={() => {
                  setIsCreating(true);
                  setSelectedId(null);
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
              <thead>
                <tr className="text-left text-xs text-stm-warm-500 border-b border-stm-warm-200">
                  {(
                    [
                      ['prefLabel', 'Name'],
                      ['type', 'Type'],
                      ['district', 'District'],
                      ['placeType', 'Product / Type'],
                      ['psurIds', 'PSUR'],
                      ['wikidataQid', 'Wikidata'],
                      ['lat', 'Coords'],
                      ['modifiedAt', 'Modified'],
                    ] as [SortKey, string][]
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      className="py-2 px-2 font-medium cursor-pointer hover:text-stm-warm-700 select-none whitespace-nowrap"
                      onClick={() => toggleSort(key)}
                    >
                      {label}
                      <SortArrow active={sortKey === key} dir={sortDir} />
                    </th>
                  ))}
                  <th className="py-2 px-2 font-medium whitespace-nowrap text-center">
                    Map
                  </th>
                  <th className="py-2 px-2 font-medium whitespace-nowrap text-center">
                    Alm.
                  </th>
                  <th className="py-2 px-2 font-medium whitespace-nowrap text-center">
                    WD
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((place) => (
                  <tr
                    key={place.id}
                    onClick={() => {
                      setSelectedId(place.id);
                      setIsCreating(false);
                    }}
                    className={`cursor-pointer border-b border-stm-warm-50 transition-colors ${
                      selectedId === place.id
                        ? 'bg-stm-sepia-50'
                        : 'bg-white hover:bg-stm-warm-50'
                    }`}
                  >
                    {/* Name */}
                    <td className="py-1.5 px-2 font-medium text-stm-warm-800 max-w-55 truncate">
                      {place.prefLabel}
                      {place.altLabels.length > 0 && (
                        <span className="text-[11px] text-stm-warm-400 ml-1 font-normal hidden xl:inline">
                          ({place.altLabels.slice(0, 2).join(', ')})
                        </span>
                      )}
                    </td>

                    {/* Type */}
                    <td className="py-1.5 px-2">
                      <span
                        className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${
                          TYPE_BADGE_COLORS[place.type] ||
                          'bg-stm-warm-100 text-stm-warm-600'
                        }`}
                      >
                        {place.type}
                      </span>
                    </td>

                    {/* District */}
                    <td className="py-1.5 px-2 text-stm-warm-600 max-w-35 truncate">
                      {place.district ?? (
                        <span className="text-stm-warm-200">--</span>
                      )}
                    </td>

                    {/* Product / Type */}
                    <td className="py-1.5 px-2 text-stm-warm-500 text-xs max-w-30 truncate">
                      {place.placeType ?? (
                        <span className="text-stm-warm-200">--</span>
                      )}
                    </td>

                    {/* PSUR */}
                    <td className="py-1.5 px-2 text-stm-warm-500 font-mono text-xs">
                      {place.psurIds.length > 0 ? (
                        place.psurIds[0]
                      ) : (
                        <span className="text-stm-warm-200">--</span>
                      )}
                    </td>

                    {/* Wikidata */}
                    <td className="py-1.5 px-2 text-stm-warm-500 font-mono text-xs">
                      {place.wikidataQid ? (
                        <a
                          href={`https://www.wikidata.org/wiki/${place.wikidataQid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-stm-teal-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {place.wikidataQid}
                        </a>
                      ) : (
                        <span className="text-stm-warm-200">--</span>
                      )}
                    </td>

                    {/* Coords */}
                    <td className="py-1.5 px-2 text-stm-warm-400 font-mono text-xs whitespace-nowrap">
                      {place.location.lat != null ? (
                        <>
                          {place.location.lat.toFixed(2)},{' '}
                          {place.location.lng?.toFixed(2)}
                        </>
                      ) : (
                        <span className="text-stm-warm-200">--</span>
                      )}
                    </td>

                    {/* Modified */}
                    <td className="py-1.5 px-2 text-stm-warm-400 text-xs whitespace-nowrap">
                      {place.modifiedAt ? (
                        new Date(place.modifiedAt).toLocaleDateString()
                      ) : (
                        <span className="text-stm-warm-200">--</span>
                      )}
                    </td>

                    {/* Map 1930 */}
                    <td className="py-1.5 px-2 text-center">
                      {place.sources.includes('map-1930') ? (
                        <span
                          className="text-stm-sepia-500"
                          title="In Map 1930"
                        >
                          &#10003;
                        </span>
                      ) : (
                        <span className="text-stm-warm-200">-</span>
                      )}
                    </td>

                    {/* Almanakken */}
                    <td className="py-1.5 px-2 text-center">
                      {place.sources.includes('almanakken') ? (
                        <span
                          className="text-stm-teal-600"
                          title="In Almanakken"
                        >
                          &#10003;
                        </span>
                      ) : (
                        <span className="text-stm-warm-200">-</span>
                      )}
                    </td>

                    {/* Wikidata */}
                    <td className="py-1.5 px-2 text-center">
                      {place.wikidataQid ? (
                        <span
                          className="text-blue-600"
                          title="Has Wikidata Q-ID"
                        >
                          &#10003;
                        </span>
                      ) : (
                        <span className="text-stm-warm-200">-</span>
                      )}
                    </td>
                  </tr>
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

        {/* Editor panel */}
        {selectedPlace && (
          <div className="w-105 shrink-0 border-l border-stm-warm-200 bg-stm-warm-50 overflow-y-auto">
            <PlaceEditor
              key={selectedPlace.id}
              place={selectedPlace}
              districts={districts}
              canEdit={auth.canEdit}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
        )}
      </div>
    </div>
  );
}
