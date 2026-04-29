'use client';

import PlaceEditor from '@/components/PlaceEditor';
import PlaceMergeView from '@/components/PlaceMergeView';
import SourceFilter, {
  emptyFilterState,
  type SourceFilterState,
} from '@/components/SourceFilter';
import { useAuth } from '@/lib/auth';
import { type AllData, loadAllData } from '@/lib/data';
import { getActiveSources, useSourceRegistry } from '@/lib/sources';
import { usePlaceTypes } from '@/lib/thesaurus';
import type {
  DistrictAssertion,
  E41Appellation,
  GazetteerPlace,
  LocationAssertion,
  PlantationStatusType,
  ProductAssertion,
  StatusAssertion,
} from '@/lib/types';
import { getPreferredName } from '@/lib/types';
import { extractPlaceId } from '@/lib/url';
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

function normalizeNamesFromLegacy(entry: Record<string, unknown>) {
  if (Array.isArray(entry.names)) {
    return entry.names;
  }

  const prefLabel =
    typeof entry.prefLabel === 'string' ? entry.prefLabel.trim() : '';
  const altLabels = Array.isArray(entry.altLabels)
    ? entry.altLabels.filter((x): x is string => typeof x === 'string')
    : [];
  const sources = Array.isArray(entry.sources)
    ? entry.sources.filter((x): x is string => typeof x === 'string')
    : [];
  const sourceId = sources[0];

  const names: Array<Record<string, unknown>> = [];
  if (prefLabel) {
    names.push({
      text: prefLabel,
      language: 'nl',
      type: 'official',
      isPreferred: true,
    });
  }
  for (const label of altLabels) {
    if (!label || label === prefLabel) continue;
    names.push({
      text: label,
      language: 'und',
      type: 'historical',
      isPreferred: false,
    });
  }
  return names;
}

function getEffectiveDistrictAssertion(
  assertions: DistrictAssertion[],
): DistrictAssertion | null {
  if (assertions.length === 0) return null;
  const explicitCurrent = assertions.find((a) => a.isCurrent);
  if (explicitCurrent) return explicitCurrent;
  const withYear = assertions.filter((a) => typeof a.sourceYear === 'number');
  if (withYear.length > 0) {
    return withYear.sort(
      (a, b) => (b.sourceYear || 0) - (a.sourceYear || 0),
    )[0];
  }
  return assertions[0];
}

function normalizeDistrictAssertionsFromLegacy(
  entry: Record<string, unknown>,
): DistrictAssertion[] {
  if (Array.isArray(entry.districtAssertions)) {
    return entry.districtAssertions
      .filter((a): a is Record<string, unknown> =>
        Boolean(a && typeof a === 'object'),
      )
      .map((a, idx) => ({
        id:
          typeof a.id === 'string' && a.id.trim()
            ? a.id
            : `district-assertion-${idx + 1}`,
        districtId:
          typeof a.districtId === 'string' && a.districtId.trim()
            ? a.districtId
            : null,
        districtLabel:
          typeof a.districtLabel === 'string' && a.districtLabel.trim()
            ? a.districtLabel
            : null,
        source:
          typeof a.source === 'string' && a.source.trim()
            ? a.source
            : 'almanakken',
        sourceYear:
          typeof a.sourceYear === 'number' && Number.isFinite(a.sourceYear)
            ? a.sourceYear
            : undefined,
        certainty:
          a.certainty === 'certain' ||
          a.certainty === 'probable' ||
          a.certainty === 'uncertain'
            ? a.certainty
            : undefined,
        note: typeof a.note === 'string' && a.note.trim() ? a.note : null,
        isCurrent: Boolean(a.isCurrent),
      }));
  }

  const broader = typeof entry.broader === 'string' ? entry.broader : null;
  const district = typeof entry.district === 'string' ? entry.district : null;
  const sources = Array.isArray(entry.sources)
    ? entry.sources.filter((x): x is string => typeof x === 'string')
    : [];

  if (!broader && !district) return [];

  return [
    {
      id: 'district-assertion-1',
      districtId: broader,
      districtLabel: district,
      source: preferAlmanakkenSource(sources),
      sourceYear: undefined,
      certainty: 'certain',
      note: null,
      isCurrent: true,
    },
  ];
}

function preferAlmanakkenSource(sources: string[]): string {
  return sources.includes('almanakken')
    ? 'almanakken'
    : sources[0] || 'almanakken';
}

function normalizeProductAssertionsFromLegacy(
  entry: Record<string, unknown>,
): ProductAssertion[] {
  const sources = Array.isArray(entry.sources)
    ? entry.sources.filter((x): x is string => typeof x === 'string')
    : [];
  if (Array.isArray(entry.productAssertions)) {
    return entry.productAssertions
      .filter((a): a is Record<string, unknown> =>
        Boolean(a && typeof a === 'object'),
      )
      .map((a, idx) => ({
        id:
          typeof a.id === 'string' && a.id.trim()
            ? a.id
            : `product-assertion-${idx + 1}`,
        value: typeof a.value === 'string' && a.value.trim() ? a.value : '',
        source:
          typeof a.source === 'string' && a.source.trim()
            ? a.source
            : preferAlmanakkenSource(sources),
        startYear:
          typeof a.startYear === 'number' && Number.isFinite(a.startYear)
            ? a.startYear
            : undefined,
        endYear:
          typeof a.endYear === 'number' && Number.isFinite(a.endYear)
            ? a.endYear
            : undefined,
        note: typeof a.note === 'string' && a.note.trim() ? a.note : null,
      }))
      .filter((a) => Boolean(a.value));
  }

  const placeType =
    typeof entry.placeType === 'string' && entry.placeType.trim()
      ? entry.placeType
      : null;
  if (!placeType) return [];
  return [
    {
      id: 'product-assertion-1',
      value: placeType,
      source: preferAlmanakkenSource(sources),
      startYear: undefined,
      endYear: undefined,
      note: null,
    },
  ];
}

function normalizeLocationAssertionsFromLegacy(
  entry: Record<string, unknown>,
): LocationAssertion[] {
  const sources = Array.isArray(entry.sources)
    ? entry.sources.filter((x): x is string => typeof x === 'string')
    : [];
  if (Array.isArray(entry.locationAssertions)) {
    return entry.locationAssertions
      .filter((a): a is Record<string, unknown> =>
        Boolean(a && typeof a === 'object'),
      )
      .map((a, idx) => ({
        id:
          typeof a.id === 'string' && a.id.trim()
            ? a.id
            : `location-assertion-${idx + 1}`,
        standardized:
          typeof a.standardized === 'string' && a.standardized.trim()
            ? a.standardized
            : null,
        original:
          typeof a.original === 'string' && a.original.trim()
            ? a.original
            : null,
        source:
          typeof a.source === 'string' && a.source.trim()
            ? a.source
            : preferAlmanakkenSource(sources),
        startYear:
          typeof a.startYear === 'number' && Number.isFinite(a.startYear)
            ? a.startYear
            : undefined,
        endYear:
          typeof a.endYear === 'number' && Number.isFinite(a.endYear)
            ? a.endYear
            : undefined,
        note: typeof a.note === 'string' && a.note.trim() ? a.note : null,
      }))
      .filter((a) => Boolean(a.standardized || a.original));
  }

  const locationDescription =
    typeof entry.locationDescription === 'string' &&
    entry.locationDescription.trim()
      ? entry.locationDescription
      : null;
  const locationDescriptionOriginal =
    typeof entry.locationDescriptionOriginal === 'string' &&
    entry.locationDescriptionOriginal.trim()
      ? entry.locationDescriptionOriginal
      : null;
  if (!locationDescription && !locationDescriptionOriginal) return [];
  return [
    {
      id: 'location-assertion-1',
      standardized: locationDescription,
      original: locationDescriptionOriginal,
      source: preferAlmanakkenSource(sources),
      startYear: undefined,
      endYear: undefined,
      note: null,
    },
  ];
}

function normalizeStatusAssertionsFromLegacy(
  entry: Record<string, unknown>,
): StatusAssertion[] {
  const sources = Array.isArray(entry.sources)
    ? entry.sources.filter((x): x is string => typeof x === 'string')
    : [];
  if (Array.isArray(entry.statusAssertions)) {
    return entry.statusAssertions
      .filter((a): a is Record<string, unknown> =>
        Boolean(a && typeof a === 'object'),
      )
      .map((a, idx) => ({
        id:
          typeof a.id === 'string' && a.id.trim()
            ? a.id
            : `status-assertion-${idx + 1}`,
        status:
          a.status === 'planned' ||
          a.status === 'built' ||
          a.status === 'abandoned' ||
          a.status === 'reactivated' ||
          a.status === 'unknown'
            ? (a.status as PlantationStatusType)
            : 'unknown',
        source:
          typeof a.source === 'string' && a.source.trim()
            ? a.source
            : preferAlmanakkenSource(sources),
        startYear:
          typeof a.startYear === 'number' && Number.isFinite(a.startYear)
            ? a.startYear
            : undefined,
        endYear:
          typeof a.endYear === 'number' && Number.isFinite(a.endYear)
            ? a.endYear
            : undefined,
        note: typeof a.note === 'string' && a.note.trim() ? a.note : null,
      }));
  }
  return [];
}

function normalizePlaceEntry(p: GazetteerPlace): GazetteerPlace {
  return {
    ...p,
    names: normalizeNamesFromLegacy(p as unknown as Record<string, unknown>),
    districtAssertions: normalizeDistrictAssertionsFromLegacy(
      p as unknown as Record<string, unknown>,
    ),
    productAssertions: normalizeProductAssertionsFromLegacy(
      p as unknown as Record<string, unknown>,
    ),
    locationAssertions: normalizeLocationAssertionsFromLegacy(
      p as unknown as Record<string, unknown>,
    ),
    statusAssertions: normalizeStatusAssertionsFromLegacy(
      p as unknown as Record<string, unknown>,
    ),
  };
}

function getCurrentDistrictLabel(place: GazetteerPlace): string | null {
  const assertions = place.districtAssertions || [];
  const effective = getEffectiveDistrictAssertion(assertions);
  return effective?.districtLabel || place.district || null;
}

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
    districtAssertions: [],
    locationDescription: null,
    locationDescriptionOriginal: null,
    placeType: null,
    productAssertions: [],
    locationAssertions: [],
    statusAssertions: [],
    diklandRefs: [],
    modifiedBy: null,
    modifiedAt: null,
  };
}

const COLUMN_DEFS: {
  key: SortKey;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
}[] = [
  { key: 'name', label: 'Name', defaultVisible: true, alwaysVisible: true },
  { key: 'type', label: 'Type', defaultVisible: true },
  { key: 'district', label: 'District', defaultVisible: true },
  { key: 'placeType', label: 'Product / Type', defaultVisible: false },
  { key: 'psurIds', label: 'PSUR', defaultVisible: true },
  { key: 'externalLinks', label: 'Links', defaultVisible: true },
  { key: 'wikidata', label: 'WD', defaultVisible: true },
  { key: 'dikland', label: 'Dik.', defaultVisible: true },
  { key: 'lat', label: 'Coords', defaultVisible: true },
  { key: 'modifiedAt', label: 'Modified', defaultVisible: true },
  { key: 'map1930', label: 'Map', defaultVisible: true },
  { key: 'almanakken', label: 'Alm.', defaultVisible: true },
];

const LS_COLUMNS_KEY = 'stm-places-visible-columns';

function loadVisibleColumns(): Set<SortKey> {
  try {
    const stored = localStorage.getItem(LS_COLUMNS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as SortKey[];
      return new Set(parsed);
    }
  } catch {
    // ignore
  }
  return new Set(COLUMN_DEFS.filter((c) => c.defaultVisible).map((c) => c.key));
}

function saveVisibleColumns(cols: Set<SortKey>) {
  try {
    localStorage.setItem(LS_COLUMNS_KEY, JSON.stringify([...cols]));
  } catch {
    // ignore
  }
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
  mergeChecked?: boolean;
  mergeDisabled?: boolean;
  onMergeCheck?: (id: string, checked: boolean) => void;
  colors: Record<string, string>;
  labels: Record<string, string>;
  visibleColumns: Set<SortKey>;
}

const PlaceRow = memo(function PlaceRow({
  place,
  isSelected,
  onSelect,
  mergeChecked,
  mergeDisabled,
  onMergeCheck,
  colors,
  labels,
  visibleColumns,
}: PlaceRowProps) {
  const handleClick = useCallback(
    () => onSelect(place.id),
    [onSelect, place.id],
  );
  const altNames = place.names.filter((n) => !n.isPreferred);
  const vis = (key: SortKey) => visibleColumns.has(key);

  return (
    <tr
      onClick={handleClick}
      className={`cursor-pointer border-b border-stm-warm-50 transition-colors ${
        isSelected ? 'bg-stm-sepia-50' : 'bg-white hover:bg-stm-warm-50'
      }`}
    >
      {/* Merge checkbox */}
      {onMergeCheck !== undefined && (
        <td className="py-1.5 px-2 w-8" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!mergeChecked}
            onChange={(e) => onMergeCheck(place.id, e.target.checked)}
            className="accent-stm-sepia-500 cursor-pointer disabled:cursor-not-allowed"
            aria-label={`Select ${getPreferredName(place)} for merge`}
            disabled={!!place.mergedInto || (mergeDisabled && !mergeChecked)}
            title={
              mergeDisabled && !mergeChecked
                ? 'Deselect one of the 2 chosen places first'
                : undefined
            }
          />
        </td>
      )}
      {/* Name — always visible */}
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
      {vis('type') && (
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
      )}

      {/* District */}
      {vis('district') && (
        <td className="py-1.5 px-2 text-stm-warm-600 max-w-35 truncate">
          {getCurrentDistrictLabel(place) ?? (
            <span className="text-stm-warm-200">--</span>
          )}
        </td>
      )}

      {/* Product / Type */}
      {vis('placeType') && (
        <td className="py-1.5 px-2 text-stm-warm-500 text-xs max-w-30 truncate">
          {place.placeType ?? <span className="text-stm-warm-200">--</span>}
        </td>
      )}

      {/* PSUR */}
      {vis('psurIds') && (
        <td className="py-1.5 px-2 text-stm-warm-500 font-mono text-xs">
          {place.psurIds.length > 0 ? (
            place.psurIds.join(', ')
          ) : (
            <span className="text-stm-warm-200">--</span>
          )}
        </td>
      )}

      {/* External Links */}
      {vis('externalLinks') && (
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
      )}

      {/* Wikidata */}
      {vis('wikidata') && (
        <td className="py-1.5 px-2 text-center">
          {(place.externalLinks || []).some(
            (l) => l.authority === 'wikidata',
          ) ? (
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
      )}

      {/* Dikland */}
      {vis('dikland') && (
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
      )}

      {/* Coords */}
      {vis('lat') && (
        <td className="py-1.5 px-2 text-stm-warm-400 font-mono text-xs whitespace-nowrap">
          {place.location.lat != null ? (
            <>
              {place.location.lat.toFixed(2)}, {place.location.lng?.toFixed(2)}
            </>
          ) : (
            <span className="text-stm-warm-200">--</span>
          )}
        </td>
      )}

      {/* Modified */}
      {vis('modifiedAt') && (
        <td className="py-1.5 px-2 text-stm-warm-400 text-xs whitespace-nowrap">
          {place.modifiedAt ? (
            new Date(place.modifiedAt).toLocaleDateString()
          ) : (
            <span className="text-stm-warm-200">--</span>
          )}
        </td>
      )}

      {/* Map 1930 */}
      {vis('map1930') && (
        <td className="py-1.5 px-2 text-center">
          {place.sources.includes('map-1930') ? (
            <span className="text-stm-sepia-500" title="In Map 1930">
              &#10003;
            </span>
          ) : (
            <span className="text-stm-warm-200">-</span>
          )}
        </td>
      )}

      {/* Almanakken */}
      {vis('almanakken') && (
        <td className="py-1.5 px-2 text-center">
          {place.sources.includes('almanakken') ? (
            <span className="text-stm-teal-600" title="In Almanakken">
              &#10003;
            </span>
          ) : (
            <span className="text-stm-warm-200">-</span>
          )}
        </td>
      )}
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
  const [allData, setAllData] = useState<AllData | null>(null);
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
  const [visibleColumns, setVisibleColumns] = useState<Set<SortKey>>(() =>
    loadVisibleColumns(),
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [mergeCheckIds, setMergeCheckIds] = useState<string[]>([]);
  const [showMerged, setShowMerged] = useState(false);
  const [mergeView, setMergeView] = useState<{
    placeA: GazetteerPlace;
    placeB: GazetteerPlace;
  } | null>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

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
        // Normalize: support legacy prefLabel/altLabels and preserve source metadata.
        setPlaces(entries.map(normalizePlaceEntry));
      })
      .finally(() => setLoading(false));

    loadAllData()
      .then(setAllData)
      .catch(() => setAllData(null));
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

  const handleMergeCheck = useCallback(
    (id: string, checked: boolean) => {
      setMergeCheckIds((prev) => {
        if (checked) {
          const place = places.find((p) => p.id === id);
          if (!place || place.mergedInto) return prev;
          if (prev.length >= 2 || prev.includes(id)) return prev;
          return [...prev, id];
        }
        return prev.filter((x) => x !== id);
      });
    },
    [places],
  );

  const handleOpenMergeView = useCallback(() => {
    if (mergeCheckIds.length !== 2) return;
    const placeA = places.find((p) => p.id === mergeCheckIds[0]);
    const placeB = places.find((p) => p.id === mergeCheckIds[1]);
    if (placeA && placeB) {
      setMergeView({ placeA, placeB });
      setSelectedIds([]);
      setIsCreating(false);
    }
  }, [mergeCheckIds, places]);

  const handleMergeConfirm = useCallback(
    async (merged: GazetteerPlace, retiredId: string) => {
      const res = await fetch('/api/places/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryId: merged.id,
          retiredId,
          mergedPlace: merged,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to merge');
      }
      // Reload gazetteer from the updated public copy
      const gazetteRes = await fetch('/data/places-gazetteer.jsonld');
      const gazetteData = await gazetteRes.json();
      const entries: GazetteerPlace[] = gazetteData['@graph'] || gazetteData;
      if (Array.isArray(entries)) {
        setPlaces(entries.map(normalizePlaceEntry));
      }
      setMergeView(null);
      setMergeCheckIds([]);
      setSelectedIds([merged.id]);
      syncUrlToSelection([merged.id]);
    },
    [syncUrlToSelection],
  );

  // Filter, search, and sort
  const filtered = useMemo(() => {
    let list = places;
    // Hide merged-retired entries unless explicitly shown
    if (!showMerged) {
      list = list.filter((p) => !p.mergedInto);
    }
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
          (getCurrentDistrictLabel(p) &&
            getCurrentDistrictLabel(p)?.toLowerCase().includes(q)) ||
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
          return cmp(getCurrentDistrictLabel(a), getCurrentDistrictLabel(b));
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
  }, [places, typeFilter, search, sortKey, sortDir, sourceFilter, showMerged]);

  const mergedCount = useMemo(
    () => places.filter((p) => p.mergedInto).length,
    [places],
  );

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

  const selectedSourceAppellations = useMemo(() => {
    if (!allData?.geojson || !selectedId || isCreating) return [];

    const selectedFeature = allData.geojson.features.find((f) => {
      const props = f.properties;
      return (
        props.stmId === selectedId ||
        extractPlaceId(props.placeUri) === selectedId ||
        extractPlaceId(props.plantationUri) === selectedId ||
        extractPlaceId(props.featureUri) === selectedId ||
        f.id === selectedId
      );
    });

    if (!selectedFeature) return [];

    const props = selectedFeature.properties;
    const plantationUri = props.plantationUri ?? null;
    const featureUri = props.featureUri ?? props.placeUri ?? null;
    let orgUri = props.organizationQid
      ? `http://www.wikidata.org/entity/${props.organizationQid}`
      : null;
    if (!orgUri && plantationUri) {
      orgUri =
        allData.plantations[plantationUri]?.P52_has_current_owner ?? null;
    }

    const uriCandidates = [plantationUri, featureUri, orgUri].filter(
      (uri): uri is string => Boolean(uri),
    );

    const gathered: E41Appellation[] = [];
    for (const uri of uriCandidates) {
      const apps = allData.appellations[uri] || [];
      gathered.push(...apps);
    }

    return Array.from(new Map(gathered.map((a) => [a['@id'], a])).values()).map(
      (app) => ({
        id: app['@id'],
        text: app.P190_has_symbolic_content,
        language: app.P72_has_language,
        sourceUri: app.P128i_is_carried_by,
        sourceLabel: app.P128i_is_carried_by
          ? allData.sources[app.P128i_is_carried_by]?.prefLabel || null
          : null,
        sourceYear: app.mapYear ? Number(app.mapYear) : undefined,
      }),
    );
  }, [allData, selectedId, isCreating]);

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

  // Close columns popover on outside click
  useEffect(() => {
    if (!columnsOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        columnsRef.current &&
        !columnsRef.current.contains(e.target as Node)
      ) {
        setColumnsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [columnsOpen]);

  const toggleColumn = useCallback((key: SortKey) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      saveVisibleColumns(next);
      return next;
    });
  }, []);

  const resetColumns = useCallback(() => {
    const defaults = new Set(
      COLUMN_DEFS.filter((c) => c.defaultVisible).map((c) => c.key),
    );
    saveVisibleColumns(defaults);
    setVisibleColumns(defaults);
  }, []);

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

      {mergeView ? (
        <PlaceMergeView
          placeA={mergeView.placeA}
          placeB={mergeView.placeB}
          districts={districts}
          canEdit={canEdit}
          onMerge={handleMergeConfirm}
          onCancel={() => setMergeView(null)}
        />
      ) : (
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

                {/* Columns toggle */}
                <div
                  className="relative border-l border-stm-warm-200 pl-3 shrink-0"
                  ref={columnsRef}
                >
                  <button
                    onClick={() => setColumnsOpen((o) => !o)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border transition-colors ${
                      columnsOpen
                        ? 'border-stm-sepia-400 bg-stm-sepia-50 text-stm-sepia-700'
                        : 'border-stm-warm-200 bg-white text-stm-warm-600 hover:border-stm-warm-300 hover:text-stm-warm-800'
                    }`}
                    aria-expanded={columnsOpen}
                    aria-haspopup="true"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeWidth="2"
                        d="M9 4h1v16H9zM14 4h1v16h-1z"
                      />
                      <rect x="3" y="4" width="4" height="16" strokeWidth="2" />
                      <rect
                        x="17"
                        y="4"
                        width="4"
                        height="16"
                        strokeWidth="2"
                      />
                    </svg>
                    Columns
                    <span className="text-stm-warm-400">
                      ({visibleColumns.size}/{COLUMN_DEFS.length})
                    </span>
                  </button>

                  {columnsOpen && (
                    <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-stm-warm-200 shadow-md min-w-44 py-1">
                      {COLUMN_DEFS.map((col) => (
                        <label
                          key={col.key}
                          className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer select-none ${
                            col.alwaysVisible
                              ? 'text-stm-warm-400 cursor-not-allowed'
                              : 'text-stm-warm-700 hover:bg-stm-warm-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={
                              col.alwaysVisible || visibleColumns.has(col.key)
                            }
                            disabled={col.alwaysVisible}
                            onChange={() =>
                              !col.alwaysVisible && toggleColumn(col.key)
                            }
                            className="accent-stm-sepia-500"
                          />
                          {col.label}
                          {col.alwaysVisible && (
                            <span className="ml-auto text-stm-warm-300 text-[10px]">
                              always
                            </span>
                          )}
                        </label>
                      ))}
                      <div className="border-t border-stm-warm-100 mt-1 pt-1 px-3 pb-1">
                        <button
                          onClick={resetColumns}
                          className="text-[11px] text-stm-warm-400 hover:text-stm-sepia-600 transition-colors"
                        >
                          Reset to defaults
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Merge selection controls — only shown when logged in and 1+ entries are checked */}
                {canEdit && mergeCheckIds.length > 0 && (
                  <div className="flex items-center gap-2 border-l border-stm-warm-200 pl-3 shrink-0">
                    <span className="text-xs text-stm-sepia-600 whitespace-nowrap">
                      {mergeCheckIds.length === 1
                        ? '1 of 2 selected'
                        : '2 selected, ready to merge'}
                    </span>
                    {mergeCheckIds.length === 2 && (
                      <button
                        onClick={handleOpenMergeView}
                        className="px-3 py-1.5 text-sm font-medium bg-stm-sepia-600 text-white hover:bg-stm-sepia-700 transition-colors"
                      >
                        Merge selected
                      </button>
                    )}
                    <button
                      onClick={() => setMergeCheckIds([])}
                      className="text-xs text-stm-warm-400 hover:text-stm-warm-600 underline"
                    >
                      clear
                    </button>
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
              <div className="text-xs text-stm-warm-400 px-4 sm:px-6 lg:px-8 pt-2 pb-1 max-w-350 mx-auto flex items-center gap-3">
                <span>
                  {filtered.length} of {places.length} places
                </span>
                {mergedCount > 0 && (
                  <span>
                    &middot;{' '}
                    {showMerged ? (
                      <>
                        {mergedCount} merged shown{' '}
                        <button
                          onClick={() => setShowMerged(false)}
                          className="underline hover:text-stm-sepia-600"
                        >
                          hide
                        </button>
                      </>
                    ) : (
                      <>
                        {mergedCount} merged hidden{' '}
                        <button
                          onClick={() => setShowMerged(true)}
                          className="underline hover:text-stm-sepia-600"
                        >
                          show
                        </button>
                      </>
                    )}
                  </span>
                )}
              </div>

              <div className="px-4 sm:px-6 lg:px-8 pb-4 max-w-350 mx-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="text-left text-xs text-stm-warm-500 border-b border-stm-warm-200">
                      {canEdit && (
                        <th
                          className="py-2 px-2 w-8"
                          aria-label="Select for merge"
                        />
                      )}
                      {COLUMN_DEFS.filter(
                        (col) =>
                          col.alwaysVisible || visibleColumns.has(col.key),
                      ).map((col) => (
                        <th
                          key={col.key}
                          className="py-2 px-2 font-medium cursor-pointer hover:text-stm-warm-700 select-none whitespace-nowrap"
                          onClick={() => toggleSort(col.key)}
                        >
                          {col.label}
                          <SortArrow
                            active={sortKey === col.key}
                            dir={sortDir}
                          />
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
                        mergeChecked={
                          canEdit ? mergeCheckIds.includes(place.id) : undefined
                        }
                        mergeDisabled={
                          canEdit ? mergeCheckIds.length >= 2 : undefined
                        }
                        onMergeCheck={canEdit ? handleMergeCheck : undefined}
                        colors={colors}
                        labels={labels}
                        visibleColumns={visibleColumns}
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
              <div className="w-[40%] min-w-105 max-w-160 shrink-0 border-l border-stm-warm-200 bg-stm-warm-50 overflow-hidden flex flex-col">
                <PlaceEditor
                  key={selectedPlace.id}
                  place={selectedPlace}
                  districts={districts}
                  sourceAppellations={selectedSourceAppellations}
                  canEdit={canEdit}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  onDelete={canEdit ? handleDelete : undefined}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
