'use client';

import { getSourcesByCategory, useSourceRegistry } from '@/lib/sources';
import { usePlaceTypes } from '@/lib/thesaurus';
import type {
  AssertionCertainty,
  DiklandRef,
  DistrictAssertion,
  ExternalLink,
  GazetteerPlace,
  LanguageCode,
  LocationAssertion,
  NameType,
  PlaceName,
  PlantationStatusType,
  ProductAssertion,
  SkosMatchType,
  StatusAssertion,
} from '@/lib/types';
import { getPreferredName } from '@/lib/types';
import { buildExploreUrl } from '@/lib/url';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const PlaceMiniMap = dynamic(() => import('./PlaceMiniMap'), { ssr: false });

interface PlaceEditorProps {
  place: GazetteerPlace;
  districts: GazetteerPlace[];
  sourceAppellations?: SourceAppellationHint[];
  canEdit: boolean;
  onSave: (place: GazetteerPlace) => Promise<void>;
  onCancel: () => void;
  onDelete?: (id: string) => Promise<void>;
}

interface SourceAppellationHint {
  id: string;
  text: string;
  language?: string;
  sourceUri?: string;
  sourceLabel?: string | null;
  sourceYear?: number;
}

function normalizeAppellationText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

function normalizeDistrictAssertions(
  place: GazetteerPlace,
): DistrictAssertion[] {
  if (Array.isArray(place.districtAssertions)) {
    return place.districtAssertions.map((a, idx) => ({
      id: a.id || `district-assertion-${idx + 1}`,
      districtId: a.districtId ?? null,
      districtLabel: a.districtLabel ?? null,
      source: a.source || preferAlmanakkenSource(place.sources),
      sourceYear: a.sourceYear,
      certainty: a.certainty,
      note: a.note ?? null,
      isCurrent: a.isCurrent,
    }));
  }

  if (!place.broader && !place.district) return [];

  return [
    {
      id: 'district-assertion-1',
      districtId: place.broader ?? null,
      districtLabel: place.district ?? null,
      source: preferAlmanakkenSource(place.sources),
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

function normalizeProductAssertions(place: GazetteerPlace): ProductAssertion[] {
  if (Array.isArray(place.productAssertions)) {
    return place.productAssertions
      .map((a, idx) => ({
        id: a.id || `product-assertion-${idx + 1}`,
        value: a.value || '',
        source: a.source || preferAlmanakkenSource(place.sources),
        startYear: a.startYear,
        endYear: a.endYear,
        note: a.note ?? null,
      }))
      .filter((a) => Boolean(a.value));
  }
  if (!place.placeType) return [];
  return [
    {
      id: 'product-assertion-1',
      value: place.placeType,
      source: preferAlmanakkenSource(place.sources),
      startYear: undefined,
      endYear: undefined,
      note: null,
    },
  ];
}

function normalizeLocationAssertions(
  place: GazetteerPlace,
): LocationAssertion[] {
  if (Array.isArray(place.locationAssertions)) {
    return place.locationAssertions
      .map((a, idx) => ({
        id: a.id || `location-assertion-${idx + 1}`,
        standardized: a.standardized ?? null,
        original: a.original ?? null,
        source: a.source || preferAlmanakkenSource(place.sources),
        startYear: a.startYear,
        endYear: a.endYear,
        note: a.note ?? null,
      }))
      .filter((a) => Boolean(a.standardized || a.original));
  }
  if (!place.locationDescription && !place.locationDescriptionOriginal)
    return [];
  return [
    {
      id: 'location-assertion-1',
      standardized: place.locationDescription ?? null,
      original: place.locationDescriptionOriginal ?? null,
      source: preferAlmanakkenSource(place.sources),
      startYear: undefined,
      endYear: undefined,
      note: null,
    },
  ];
}

const VALID_STATUSES: PlantationStatusType[] = [
  'planned',
  'built',
  'abandoned',
  'reactivated',
  'present',
  'unknown',
];

function normalizeStatusAssertions(place: GazetteerPlace): StatusAssertion[] {
  if (Array.isArray(place.statusAssertions)) {
    return place.statusAssertions.map((a, idx) => ({
      id: a.id || `status-assertion-${idx + 1}`,
      status: VALID_STATUSES.includes(a.status) ? a.status : 'unknown',
      source: a.source || preferAlmanakkenSource(place.sources),
      startYear: a.startYear,
      endYear: a.endYear,
      note: a.note ?? null,
    }));
  }
  return [];
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
  sourceAppellations = [],
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
  const [draft, setDraft] = useState<GazetteerPlace>({
    ...place,
    districtAssertions: normalizeDistrictAssertions(place),
    productAssertions: normalizeProductAssertions(place),
    locationAssertions: normalizeLocationAssertions(place),
    statusAssertions: normalizeStatusAssertions(place),
  });
  const hydratedFromAppellations = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const diklandRefs: DiklandRef[] = draft.diklandRefs ?? [];
  const sourceIdByUri = useMemo(
    () => new Map(registrySources.map((s) => [s.id, s.sourceId])),
    [registrySources],
  );
  const sourceById = useMemo(
    () => new Map(registrySources.map((s) => [s.sourceId, s])),
    [registrySources],
  );

  const deriveYearFromSourceId = useCallback(
    (sourceId?: string): number | undefined => {
      if (!sourceId) return undefined;
      const source = sourceById.get(sourceId);
      if (!source) return undefined;
      if (source.mapYear != null) return source.mapYear;
      if (source.timeSpan) {
        const match = source.timeSpan.match(/\b(\d{4})\b/);
        if (match) return Number(match[1]);
      }
      return undefined;
    },
    [sourceById],
  );

  const sourceDisplayLabel = useCallback(
    (sourceId: string): string => {
      const source = sourceById.get(sourceId);
      if (!source) return sourceId;
      const yearOrRange =
        source.mapYear != null
          ? String(source.mapYear)
          : source.timeSpan || 'n.d.';
      return `${source.sourceId} (${yearOrRange})`;
    },
    [sourceById],
  );

  const deriveDistrictLabelById = useCallback(
    (districtId: string | null): string | null => {
      if (!districtId) return null;
      const match = districts.find((d) => d.id === districtId);
      return match ? getPreferredName(match) : null;
    },
    [districts],
  );

  const applyDistrictAssertions = useCallback(
    (nextAssertions: DistrictAssertion[]) => {
      const effective = getEffectiveDistrictAssertion(nextAssertions);
      const effectiveDistrictId = effective?.districtId ?? null;
      const effectiveDistrictLabel =
        effective?.districtLabel ??
        deriveDistrictLabelById(effectiveDistrictId);
      setDraft((d) => ({
        ...d,
        districtAssertions: nextAssertions,
        broader: effectiveDistrictId,
        district: effectiveDistrictLabel ?? null,
      }));
    },
    [deriveDistrictLabelById],
  );

  const districtSourceSummary = useMemo(() => {
    const assertionSources = (draft.districtAssertions || [])
      .map((a) => a.source)
      .filter(Boolean);
    const sourceIds =
      assertionSources.length > 0 ? assertionSources : draft.sources;
    const labels = Array.from(
      new Set(
        sourceIds
          .map((sourceId) => sourceById.get(sourceId)?.prefLabel || sourceId)
          .filter(Boolean),
      ),
    );
    if (labels.length === 0) return 'source metadata unavailable';
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} + ${labels[1]}`;
    return `${labels[0]} + ${labels[1]} + ${labels.length - 2} more`;
  }, [draft.districtAssertions, draft.sources, sourceById]);

  const districtAssertions = draft.districtAssertions || [];

  const addDistrictAssertion = useCallback(() => {
    const next: DistrictAssertion[] = [
      ...districtAssertions,
      {
        id: `district-assertion-${Date.now()}`,
        districtId: draft.broader ?? null,
        districtLabel: draft.district ?? null,
        source: preferAlmanakkenSource(draft.sources),
        sourceYear: undefined,
        certainty: 'certain',
        note: null,
        isCurrent: districtAssertions.length === 0,
      },
    ];
    applyDistrictAssertions(next);
  }, [
    applyDistrictAssertions,
    districtAssertions,
    draft.broader,
    draft.district,
    draft.sources,
  ]);

  const updateDistrictAssertion = useCallback(
    (idx: number, patch: Partial<DistrictAssertion>) => {
      const next = districtAssertions.map((a, i) => {
        if (i !== idx) return a;
        const updated = { ...a, ...patch };
        if (updated.districtId) {
          updated.districtLabel = deriveDistrictLabelById(updated.districtId);
        }
        return updated;
      });

      if (patch.isCurrent) {
        for (let i = 0; i < next.length; i += 1) {
          next[i] = { ...next[i], isCurrent: i === idx };
        }
      }

      applyDistrictAssertions(next);
    },
    [applyDistrictAssertions, deriveDistrictLabelById, districtAssertions],
  );

  const removeDistrictAssertion = useCallback(
    (idx: number) => {
      const next = districtAssertions.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some((a) => a.isCurrent)) {
        next[0] = { ...next[0], isCurrent: true };
      }
      applyDistrictAssertions(next);
    },
    [applyDistrictAssertions, districtAssertions],
  );

  const handleDistrictSelection = useCallback(
    (districtId: string | null) => {
      const districtLabel = deriveDistrictLabelById(districtId);
      if (districtAssertions.length === 0) {
        setDraft((d) => ({
          ...d,
          broader: districtId,
          district: districtLabel,
        }));
        return;
      }

      const currentIdx = districtAssertions.findIndex((a) => a.isCurrent);
      const targetIdx = currentIdx >= 0 ? currentIdx : 0;
      const next = districtAssertions.map((a, i) =>
        i === targetIdx ? { ...a, districtId, districtLabel } : a,
      );
      if (currentIdx < 0 && next.length > 0) {
        next[0] = { ...next[0], isCurrent: true };
      }
      applyDistrictAssertions(next);
    },
    [applyDistrictAssertions, deriveDistrictLabelById, districtAssertions],
  );

  // ── Product assertions ────────────────────────────────────────────────────

  const productAssertions = draft.productAssertions || [];

  const applyProductAssertions = useCallback(
    (nextAssertions: ProductAssertion[]) => {
      const latest = [...nextAssertions]
        .filter((a) => a.value)
        .sort(
          (a, b) =>
            (b.endYear || b.startYear || 0) - (a.endYear || a.startYear || 0),
        )[0];
      setDraft((d) => ({
        ...d,
        productAssertions: nextAssertions,
        placeType: latest?.value ?? null,
      }));
    },
    [],
  );

  const addProductAssertion = useCallback(() => {
    const next: ProductAssertion[] = [
      ...productAssertions,
      {
        id: `product-assertion-${Date.now()}`,
        value: '',
        source: preferAlmanakkenSource(draft.sources),
        startYear: undefined,
        endYear: undefined,
        note: null,
      },
    ];
    applyProductAssertions(next);
  }, [applyProductAssertions, productAssertions, draft.sources]);

  const updateProductAssertion = useCallback(
    (idx: number, patch: Partial<ProductAssertion>) => {
      const next = productAssertions.map((a, i) =>
        i === idx ? { ...a, ...patch } : a,
      );
      applyProductAssertions(next);
    },
    [applyProductAssertions, productAssertions],
  );

  const removeProductAssertion = useCallback(
    (idx: number) => {
      const next = productAssertions.filter((_, i) => i !== idx);
      applyProductAssertions(next);
    },
    [applyProductAssertions, productAssertions],
  );

  // ── Location assertions ───────────────────────────────────────────────────

  const locationAssertions = draft.locationAssertions || [];

  const applyLocationAssertions = useCallback(
    (nextAssertions: LocationAssertion[]) => {
      const latest = [...nextAssertions].sort(
        (a, b) =>
          (b.endYear || b.startYear || 0) - (a.endYear || a.startYear || 0),
      )[0];
      setDraft((d) => ({
        ...d,
        locationAssertions: nextAssertions,
        locationDescription: latest?.standardized ?? null,
        locationDescriptionOriginal: latest?.original ?? null,
      }));
    },
    [],
  );

  const addLocationAssertion = useCallback(() => {
    const next: LocationAssertion[] = [
      ...locationAssertions,
      {
        id: `location-assertion-${Date.now()}`,
        standardized: null,
        original: null,
        source: preferAlmanakkenSource(draft.sources),
        startYear: undefined,
        endYear: undefined,
        note: null,
      },
    ];
    applyLocationAssertions(next);
  }, [applyLocationAssertions, locationAssertions, draft.sources]);

  const updateLocationAssertion = useCallback(
    (idx: number, patch: Partial<LocationAssertion>) => {
      const next = locationAssertions.map((a, i) =>
        i === idx ? { ...a, ...patch } : a,
      );
      applyLocationAssertions(next);
    },
    [applyLocationAssertions, locationAssertions],
  );

  const removeLocationAssertion = useCallback(
    (idx: number) => {
      const next = locationAssertions.filter((_, i) => i !== idx);
      applyLocationAssertions(next);
    },
    [applyLocationAssertions, locationAssertions],
  );

  // ── Status assertions (lifecycle) ─────────────────────────────────────────

  const statusAssertions = draft.statusAssertions || [];

  const applyStatusAssertions = useCallback(
    (nextAssertions: StatusAssertion[]) => {
      setDraft((d) => ({ ...d, statusAssertions: nextAssertions }));
    },
    [],
  );

  const addStatusAssertion = useCallback(() => {
    const next: StatusAssertion[] = [
      ...statusAssertions,
      {
        id: `status-assertion-${Date.now()}`,
        status: 'built',
        source: preferAlmanakkenSource(draft.sources),
        startYear: undefined,
        endYear: undefined,
        note: null,
      },
    ];
    applyStatusAssertions(next);
  }, [applyStatusAssertions, statusAssertions, draft.sources]);

  const updateStatusAssertion = useCallback(
    (idx: number, patch: Partial<StatusAssertion>) => {
      const next = statusAssertions.map((a, i) =>
        i === idx ? { ...a, ...patch } : a,
      );
      applyStatusAssertions(next);
    },
    [applyStatusAssertions, statusAssertions],
  );

  const removeStatusAssertion = useCallback(
    (idx: number) => {
      const next = statusAssertions.filter((_, i) => i !== idx);
      applyStatusAssertions(next);
    },
    [applyStatusAssertions, statusAssertions],
  );

  /**
   * Computed lifecycle events — merges status assertions + product assertions
   * into a flat sorted list for the read-only timeline display.
   */
  const computedLifecycleEvents = useMemo(() => {
    type EventKind = 'status' | 'product-activity';
    interface LifecycleEvent {
      kind: EventKind;
      status?: PlantationStatusType;
      product?: string;
      startYear?: number;
      endYear?: number;
      source?: string;
    }

    const events: LifecycleEvent[] = [];

    for (const a of statusAssertions) {
      events.push({
        kind: 'status',
        status: a.status,
        startYear: a.startYear,
        endYear: a.endYear,
        source: a.source,
      });
    }

    for (const a of (draft.productAssertions || []).filter((p) => p.value)) {
      events.push({
        kind: 'product-activity',
        product: a.value,
        startYear: a.startYear,
        endYear: a.endYear,
        source: a.source,
      });
    }

    // Sort by startYear ascending (undefined years go to end)
    events.sort(
      (a, b) => (a.startYear ?? Infinity) - (b.startYear ?? Infinity),
    );

    return events;
  }, [statusAssertions, draft.productAssertions]);

  /** Earliest year recorded across all assertions */
  const firstMentionYear = useMemo(() => {
    const years: number[] = [];
    for (const a of statusAssertions) {
      if (a.startYear) years.push(a.startYear);
    }
    for (const a of draft.productAssertions || []) {
      if (a.startYear) years.push(a.startYear);
    }
    for (const a of draft.locationAssertions || []) {
      if (a.startYear) years.push(a.startYear);
    }
    for (const a of draft.districtAssertions || []) {
      if (a.sourceYear) years.push(a.sourceYear);
    }
    return years.length > 0 ? Math.min(...years) : null;
  }, [
    statusAssertions,
    draft.productAssertions,
    draft.locationAssertions,
    draft.districtAssertions,
  ]);

  /** Latest year recorded across all assertions */
  const lastMentionYear = useMemo(() => {
    const years: number[] = [];
    for (const a of statusAssertions) {
      if (a.endYear) years.push(a.endYear);
      else if (a.startYear) years.push(a.startYear);
    }
    for (const a of draft.productAssertions || []) {
      if (a.endYear) years.push(a.endYear);
      else if (a.startYear) years.push(a.startYear);
    }
    for (const a of draft.locationAssertions || []) {
      if (a.endYear) years.push(a.endYear);
      else if (a.startYear) years.push(a.startYear);
    }
    for (const a of draft.districtAssertions || []) {
      if (a.sourceYear) years.push(a.sourceYear);
    }
    return years.length > 0 ? Math.max(...years) : null;
  }, [
    statusAssertions,
    draft.productAssertions,
    draft.locationAssertions,
    draft.districtAssertions,
  ]);

  useEffect(() => {
    if (hydratedFromAppellations.current) return;
    if (sourceAppellations.length === 0) return;
    // Wait for registry to resolve before hydrating
    if (sourceIdByUri.size === 0) return;

    hydratedFromAppellations.current = true;
    setDraft((d) => {
      let changed = false;
      const nextNames = [...d.names];

      for (const app of sourceAppellations) {
        const text = app.text?.trim();
        if (!text) continue;

        const idx = nextNames.findIndex(
          (n) =>
            normalizeAppellationText(n.text) === normalizeAppellationText(text),
        );
        const sourceId =
          (app.sourceUri ? sourceIdByUri.get(app.sourceUri) : undefined) ||
          undefined;
        const sourceYear =
          app.sourceYear && Number.isFinite(app.sourceYear)
            ? app.sourceYear
            : undefined;
        const hintedLanguage: LanguageCode =
          app.language === 'nl' ||
          app.language === 'en' ||
          app.language === 'srn' ||
          app.language === 'und'
            ? app.language
            : 'und';

        if (idx >= 0) {
          const current = nextNames[idx];
          const patched: PlaceName = {
            ...current,
            text: current.text.length >= text.length ? current.text : text,
            language:
              current.language === 'und' && hintedLanguage !== 'und'
                ? hintedLanguage
                : current.language,
            source: current.source || sourceId,
            sourceYear: current.sourceYear ?? sourceYear,
          };
          if (JSON.stringify(current) !== JSON.stringify(patched)) {
            nextNames[idx] = patched;
            changed = true;
          }
          continue;
        }

        nextNames.push({
          text,
          language: hintedLanguage,
          type: 'historical',
          isPreferred: nextNames.length === 0,
          source: sourceId,
          sourceYear,
        });
        changed = true;
      }

      if (nextNames.length > 0 && !nextNames.some((n) => n.isPreferred)) {
        nextNames[0] = { ...nextNames[0], isPreferred: true };
        changed = true;
      }

      // Preferred label policy: map-1930 name is authoritative when present.
      const preferredFrom1930 = nextNames.findIndex(
        (n) => n.source === 'map-1930',
      );
      if (preferredFrom1930 >= 0) {
        nextNames.forEach((name, idx) => {
          const shouldBePreferred = idx === preferredFrom1930;
          if (name.isPreferred !== shouldBePreferred) {
            nextNames[idx] = {
              ...name,
              isPreferred: shouldBePreferred,
            };
            changed = true;
          }
        });
      }

      return changed ? { ...d, names: nextNames } : d;
    });
  }, [sourceAppellations, sourceIdByUri]);

  // --- Name helpers ---
  const updateName = (index: number, patch: Partial<PlaceName>) => {
    setDraft((d) => {
      const next = d.names.map((n, i) =>
        i === index ? { ...n, ...patch } : n,
      );
      return { ...d, names: next };
    });
  };

  const setPreferred = (index: number) => {
    setDraft((d) => ({
      ...d,
      names: d.names.map((n, i) => ({ ...n, isPreferred: i === index })),
    }));
  };

  const addName = () => {
    const newName: PlaceName = {
      text: '',
      language: 'nl',
      type: 'official',
      isPreferred: draft.names.length === 0,
    };
    setDraft((d) => ({ ...d, names: [...d.names, newName] }));
  };

  const removeName = (index: number) => {
    setDraft((d) => {
      const next = d.names.filter((_, i) => i !== index);
      // Ensure at least one preferred if any remain
      if (next.length > 0 && !next.some((n) => n.isPreferred)) {
        next[0] = { ...next[0], isPreferred: true };
      }
      return { ...d, names: next };
    });
  };

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
      await onSave({ ...draft });
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
        <div className="min-w-0">
          <h3 className="text-lg font-serif font-bold text-stm-warm-800 truncate">
            {place.id.startsWith('stm-new-')
              ? 'New Place'
              : getPreferredName(place) || 'Unnamed Place'}
          </h3>
          {!place.id.startsWith('stm-new-') && (
            <Link
              href={buildExploreUrl({
                place: place.id,
                ...(place.location.lat != null && place.location.lng != null
                  ? { lat: place.location.lat, lng: place.location.lng, z: 14 }
                  : {}),
              })}
              className="inline-flex items-center gap-1 text-[11px] text-stm-teal-600 hover:text-stm-teal-700 hover:underline"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
              View on map
            </Link>
          )}
        </div>
        <button
          onClick={onCancel}
          className="text-stm-warm-400 hover:text-stm-warm-600 text-xl leading-none"
          title="Close"
        >
          x
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Names */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-stm-warm-700">
              Names
            </label>
            {canEdit && (
              <button
                type="button"
                onClick={addName}
                className="text-xs text-stm-teal-600 hover:text-stm-teal-700 font-medium"
              >
                + Add name
              </button>
            )}
          </div>

          {draft.names.length === 0 && (
            <p className="text-xs text-stm-warm-400 italic">
              No names yet.{canEdit ? ' Click "+ Add name" to add one.' : ''}
            </p>
          )}

          <div className="space-y-2">
            {draft.names.map((nm, i) => (
              <div
                key={i}
                className={`border rounded p-2.5 space-y-2 ${
                  nm.isPreferred
                    ? 'border-stm-sepia-300 bg-stm-sepia-50'
                    : 'border-stm-warm-200 bg-white'
                }`}
              >
                {/* Name text */}
                <input
                  type="text"
                  value={nm.text}
                  onChange={(e) => updateName(i, { text: e.target.value })}
                  disabled={!canEdit}
                  placeholder="Name text"
                  className="w-full px-2 py-1.5 border border-stm-warm-200 rounded text-sm bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50 disabled:text-stm-warm-400"
                />

                {/* Language + Type + actions row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Language */}
                  <select
                    value={nm.language}
                    onChange={(e) =>
                      updateName(i, {
                        language: e.target.value as LanguageCode,
                      })
                    }
                    disabled={!canEdit}
                    className="px-2 py-1 text-xs border border-stm-warm-200 rounded bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                  >
                    <option value="nl">Dutch (nl)</option>
                    <option value="en">English (en)</option>
                    <option value="srn">Sranan Tongo (srn)</option>
                    <option value="und">Unknown (und)</option>
                  </select>

                  {/* Type */}
                  <select
                    value={nm.type}
                    onChange={(e) =>
                      updateName(i, { type: e.target.value as NameType })
                    }
                    disabled={!canEdit}
                    className="px-2 py-1 text-xs border border-stm-warm-200 rounded bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                  >
                    <option value="official">Official name</option>
                    <option value="historical">Historical name</option>
                    <option value="vernacular">Vernacular name</option>
                    <option value="variant">Variant spelling</option>
                  </select>

                  {/* Source ID (registry only) */}
                  <select
                    value={nm.source ?? ''}
                    onChange={(e) => {
                      const nextSource = e.target.value || undefined;
                      const sourceYearFromRegistry =
                        deriveYearFromSourceId(nextSource);
                      updateName(i, {
                        source: nextSource,
                        sourceYear: sourceYearFromRegistry,
                      });
                    }}
                    disabled={!canEdit}
                    className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50 w-48"
                  >
                    <option value="">Source (ID + year)</option>
                    {registrySources.map((source) => (
                      <option key={source.sourceId} value={source.sourceId}>
                        {sourceDisplayLabel(source.sourceId)}
                      </option>
                    ))}
                  </select>

                  {/* Preferred radio */}
                  {canEdit && (
                    <label className="flex items-center gap-1 text-xs text-stm-warm-600 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="preferred-name"
                        checked={nm.isPreferred}
                        onChange={() => setPreferred(i)}
                        className="accent-stm-sepia-600"
                      />
                      Preferred
                    </label>
                  )}
                  {!canEdit && nm.isPreferred && (
                    <span className="text-[10px] font-medium text-stm-sepia-600 bg-stm-sepia-100 px-1.5 py-0.5 rounded">
                      Preferred
                    </span>
                  )}

                  <div className="flex-1" />

                  {/* Remove */}
                  {canEdit && draft.names.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeName(i)}
                      className="text-stm-warm-400 hover:text-red-500 text-xs"
                      title="Remove name"
                    >
                      x
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-stm-warm-400">
            Each row is one appellation. Source is selected from one authority
            dropdown (ID + year/range) and can be switched in edit mode. The
            preferred display label defaults to the 1930 map appellation when
            available.
          </p>
          {sourceAppellations.length > 0 && (
            <div className="mt-2 border border-stm-warm-200 bg-stm-warm-50 p-2 space-y-1">
              <p className="text-[10px] text-stm-warm-500 uppercase tracking-wider">
                Appellations from sources
              </p>
              {sourceAppellations.map((app) => (
                <div key={app.id} className="text-[10px] text-stm-warm-600">
                  <span className="font-medium text-stm-warm-700">
                    {app.text}
                  </span>
                  <span className="ml-1">lang: {app.language || 'und'}</span>
                  {app.sourceLabel && (
                    <span className="ml-1">source: {app.sourceLabel}</span>
                  )}
                  {app.sourceYear && (
                    <span className="ml-1">year: {app.sourceYear}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Type */}
        <div>
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
                  key={i}
                  className="flex items-center gap-2 px-2.5 py-1.5 border border-stm-warm-200 rounded bg-white text-sm"
                >
                  {canEdit ? (
                    /* Editable authority select */
                    <select
                      value={
                        AUTHORITIES.find((a) => a.id === link.authority)
                          ? link.authority
                          : '_custom'
                      }
                      onChange={(e) => {
                        const links = [...(draft.externalLinks || [])];
                        links[i] = {
                          ...links[i],
                          authority:
                            e.target.value === '_custom'
                              ? link.authority
                              : e.target.value,
                        };
                        update('externalLinks', links);
                      }}
                      className="text-xs px-1.5 py-0.5 border border-stm-warm-200 rounded bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none w-20 shrink-0"
                    >
                      {AUTHORITIES.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                      <option value="_custom">Custom</option>
                    </select>
                  ) : (
                    <span className="text-stm-warm-500 font-medium text-xs w-16 shrink-0">
                      {authorityLabel(link.authority)}
                    </span>
                  )}

                  {canEdit ? (
                    /* Editable identifier */
                    <input
                      type="text"
                      value={link.identifier}
                      onChange={(e) => {
                        const links = [...(draft.externalLinks || [])];
                        links[i] = { ...links[i], identifier: e.target.value };
                        update('externalLinks', links);
                      }}
                      placeholder={
                        AUTHORITIES.find((a) => a.id === link.authority)
                          ?.placeholder || 'Identifier / URI'
                      }
                      className="font-mono text-xs flex-1 min-w-0 px-1.5 py-0.5 border border-stm-warm-200 rounded bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none"
                    />
                  ) : (
                    <span className="font-mono text-stm-warm-700 text-xs flex-1 truncate">
                      {link.identifier}
                    </span>
                  )}

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
                  <div className="px-2.5 pb-2 pt-1.5 space-y-1.5 border-t border-stm-warm-100">
                    {canEdit ? (
                      /* Editable fields */
                      <>
                        <div>
                          <span className="text-[10px] text-stm-warm-500">
                            Folder path
                          </span>
                          <input
                            type="text"
                            value={ref.folderPath}
                            onChange={(e) => {
                              const next = [...diklandRefs];
                              next[i] = {
                                ...next[i],
                                folderPath: e.target.value,
                              };
                              update('diklandRefs', next);
                            }}
                            className="w-full mt-0.5 px-2 py-1 text-xs border border-stm-warm-200 rounded bg-white font-mono focus:ring-1 focus:ring-stm-sepia-400 outline-none"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-stm-warm-500">
                            Drive URL
                          </span>
                          <input
                            type="text"
                            value={ref.driveUrl}
                            onChange={(e) => {
                              const next = [...diklandRefs];
                              next[i] = {
                                ...next[i],
                                driveUrl: e.target.value,
                              };
                              update('diklandRefs', next);
                            }}
                            className="w-full mt-0.5 px-2 py-1 text-xs border border-stm-warm-200 rounded bg-white font-mono focus:ring-1 focus:ring-stm-sepia-400 outline-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-stm-warm-500">
                              Author
                            </span>
                            <input
                              type="text"
                              value={ref.author ?? ''}
                              onChange={(e) => {
                                const next = [...diklandRefs];
                                next[i] = {
                                  ...next[i],
                                  author: e.target.value || null,
                                };
                                update('diklandRefs', next);
                              }}
                              className="w-full mt-0.5 px-2 py-1 text-xs border border-stm-warm-200 rounded bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-stm-warm-500">
                              Year
                            </span>
                            <input
                              type="text"
                              value={ref.year ?? ''}
                              onChange={(e) => {
                                const next = [...diklandRefs];
                                next[i] = {
                                  ...next[i],
                                  year: e.target.value || null,
                                };
                                update('diklandRefs', next);
                              }}
                              className="w-full mt-0.5 px-2 py-1 text-xs border border-stm-warm-200 rounded bg-white font-mono focus:ring-1 focus:ring-stm-sepia-400 outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] text-stm-warm-500">
                            Notes
                          </span>
                          <textarea
                            value={ref.notes ?? ''}
                            onChange={(e) => {
                              const next = [...diklandRefs];
                              next[i] = {
                                ...next[i],
                                notes: e.target.value || null,
                              };
                              update('diklandRefs', next);
                            }}
                            rows={2}
                            className="w-full mt-0.5 px-2 py-1 text-xs border border-stm-warm-200 rounded bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none resize-y"
                          />
                        </div>
                      </>
                    ) : (
                      /* Read-only view */
                      <>
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
                      </>
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

        {/* Location Context */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-stm-warm-700">
            Location Context
          </label>
          <div>
            <label className="block text-sm font-medium text-stm-warm-700 mb-1">
              District (according to {districtSourceSummary})
            </label>
            <select
              value={draft.broader || ''}
              onChange={(e) => handleDistrictSelection(e.target.value || null)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-stm-warm-200 rounded text-sm bg-white focus:ring-2 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
            >
              <option value="">-- None --</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {getPreferredName(d)}
                </option>
              ))}
            </select>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-stm-warm-500 uppercase tracking-wider">
                  District Statements
                </p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={addDistrictAssertion}
                    className="text-xs text-stm-teal-600 hover:text-stm-teal-700 font-medium"
                  >
                    + Add district statement
                  </button>
                )}
              </div>

              {districtAssertions.length === 0 && (
                <p className="text-xs text-stm-warm-400 italic">
                  No district statements yet.
                </p>
              )}

              {districtAssertions.map((assertion, i) => (
                <div
                  key={assertion.id}
                  className="border border-stm-warm-200 bg-white p-2.5 space-y-2"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={assertion.districtId || ''}
                      onChange={(e) =>
                        updateDistrictAssertion(i, {
                          districtId: e.target.value || null,
                        })
                      }
                      disabled={!canEdit}
                      className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                    >
                      <option value="">District target</option>
                      {districts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {getPreferredName(d)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={assertion.source}
                      onChange={(e) =>
                        updateDistrictAssertion(i, { source: e.target.value })
                      }
                      disabled={!canEdit}
                      className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                    >
                      {registrySources.map((source) => (
                        <option key={source.sourceId} value={source.sourceId}>
                          {sourceDisplayLabel(source.sourceId)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={assertion.sourceYear ?? ''}
                      onChange={(e) =>
                        updateDistrictAssertion(i, {
                          sourceYear: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={!canEdit}
                      placeholder="Year"
                      className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                    />
                    <select
                      value={assertion.certainty || 'certain'}
                      onChange={(e) =>
                        updateDistrictAssertion(i, {
                          certainty: e.target.value as AssertionCertainty,
                        })
                      }
                      disabled={!canEdit}
                      className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                    >
                      <option value="certain">Certain</option>
                      <option value="probable">Probable</option>
                      <option value="uncertain">Uncertain</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1 text-xs text-stm-warm-600">
                      <input
                        type="checkbox"
                        checked={Boolean(assertion.isCurrent)}
                        onChange={(e) =>
                          updateDistrictAssertion(i, {
                            isCurrent: e.target.checked,
                          })
                        }
                        disabled={!canEdit}
                      />
                      Current
                    </label>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeDistrictAssertion(i)}
                        className="text-xs text-stm-warm-400 hover:text-red-500"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Product observations */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-stm-warm-700">
                Product (per year / source)
              </label>
              {canEdit && (
                <button
                  type="button"
                  onClick={addProductAssertion}
                  className="text-xs text-stm-sepia-600 hover:text-stm-sepia-800"
                >
                  + Add product observation
                </button>
              )}
            </div>
            {productAssertions.length === 0 && (
              <p className="text-xs text-stm-warm-400 italic">
                No product observations recorded.
              </p>
            )}
            <div className="space-y-2">
              {productAssertions.map((assertion, i) => (
                <div
                  key={assertion.id}
                  className="border border-stm-warm-200 bg-stm-warm-50 p-2 space-y-2"
                >
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={assertion.value}
                      onChange={(e) =>
                        updateProductAssertion(i, { value: e.target.value })
                      }
                      disabled={!canEdit}
                      placeholder="e.g. koffie, suiker"
                      className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                    />
                    <input
                      type="number"
                      value={assertion.startYear ?? ''}
                      onChange={(e) =>
                        updateProductAssertion(i, {
                          startYear: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={!canEdit}
                      placeholder="From"
                      className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                    />
                    <input
                      type="number"
                      value={assertion.endYear ?? ''}
                      onChange={(e) =>
                        updateProductAssertion(i, {
                          endYear: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={!canEdit}
                      placeholder="To"
                      className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={assertion.source}
                      onChange={(e) =>
                        updateProductAssertion(i, { source: e.target.value })
                      }
                      disabled={!canEdit}
                      className="flex-1 px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                    >
                      {registrySources.map((source) => (
                        <option key={source.sourceId} value={source.sourceId}>
                          {sourceDisplayLabel(source.sourceId)}
                        </option>
                      ))}
                    </select>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeProductAssertion(i)}
                        className="text-xs text-stm-warm-400 hover:text-red-500 shrink-0"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Location observations */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-stm-warm-700">
                Location Observations (Almanakken)
              </label>
              {canEdit && (
                <button
                  type="button"
                  onClick={addLocationAssertion}
                  className="text-xs text-stm-sepia-600 hover:text-stm-sepia-800"
                >
                  + Add location observation
                </button>
              )}
            </div>
            {locationAssertions.length === 0 && (
              <p className="text-xs text-stm-warm-400 italic">
                No location observations recorded.
              </p>
            )}
            <div className="space-y-2">
              {locationAssertions.map((assertion, i) => (
                <div
                  key={assertion.id}
                  className="border border-stm-warm-200 bg-stm-warm-50 p-2 space-y-2"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={assertion.standardized || ''}
                      onChange={(e) =>
                        updateLocationAssertion(i, {
                          standardized: e.target.value || null,
                        })
                      }
                      disabled={!canEdit}
                      placeholder="Standardized (e.g. Suriname)"
                      className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                    />
                    <input
                      type="text"
                      value={assertion.original || ''}
                      onChange={(e) =>
                        updateLocationAssertion(i, {
                          original: e.target.value || null,
                        })
                      }
                      disabled={!canEdit}
                      placeholder="Original (e.g. Rivier Suriname, regterhand)"
                      className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={assertion.source}
                      onChange={(e) =>
                        updateLocationAssertion(i, { source: e.target.value })
                      }
                      disabled={!canEdit}
                      className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                    >
                      {registrySources.map((source) => (
                        <option key={source.sourceId} value={source.sourceId}>
                          {sourceDisplayLabel(source.sourceId)}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={assertion.startYear ?? ''}
                        onChange={(e) =>
                          updateLocationAssertion(i, {
                            startYear: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                        disabled={!canEdit}
                        placeholder="From"
                        className="w-full px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                      />
                      <span className="text-xs text-stm-warm-400 shrink-0">
                        –
                      </span>
                      <input
                        type="number"
                        value={assertion.endYear ?? ''}
                        onChange={(e) =>
                          updateLocationAssertion(i, {
                            endYear: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                        disabled={!canEdit}
                        placeholder="To"
                        className="w-full px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                      />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeLocationAssertion(i)}
                          className="text-xs text-stm-warm-400 hover:text-red-500 shrink-0"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Plantation Lifecycle */}
        {draft.type === 'plantation' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-stm-warm-700">
                Plantation Lifecycle
              </label>
              {canEdit && (
                <button
                  type="button"
                  onClick={addStatusAssertion}
                  className="text-xs text-stm-sepia-600 hover:text-stm-sepia-800"
                >
                  + Add lifecycle event
                </button>
              )}
            </div>

            {/* First / last mention computed markers */}
            {(firstMentionYear !== null || lastMentionYear !== null) && (
              <div className="flex gap-3">
                {firstMentionYear !== null && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-stm-warm-600 bg-stm-warm-100 border border-stm-warm-200 px-2 py-0.5">
                    <span className="font-medium">First mentioned:</span>{' '}
                    {firstMentionYear}
                  </span>
                )}
                {lastMentionYear !== null && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-stm-warm-600 bg-stm-warm-100 border border-stm-warm-200 px-2 py-0.5">
                    <span className="font-medium">Last mentioned:</span>{' '}
                    {lastMentionYear}
                  </span>
                )}
              </div>
            )}

            {/* Computed timeline (read-only merged view) */}
            {computedLifecycleEvents.length > 0 && (
              <div className="border border-stm-warm-200 divide-y divide-stm-warm-100">
                <p className="px-2 py-1 text-[10px] text-stm-warm-500 uppercase tracking-wider bg-stm-warm-50">
                  Timeline
                </p>
                {computedLifecycleEvents.map((ev, i) => {
                  const yearSpan = ev.startYear
                    ? ev.endYear && ev.endYear !== ev.startYear
                      ? `${ev.startYear}–${ev.endYear}`
                      : String(ev.startYear)
                    : ev.endYear
                      ? `–${ev.endYear}`
                      : null;

                  const statusColors: Record<string, string> = {
                    planned:
                      'bg-stm-warm-100 text-stm-warm-700 border-stm-warm-300',
                    built:
                      'bg-stm-teal-50 text-stm-teal-800 border-stm-teal-200',
                    abandoned: 'bg-red-50 text-red-700 border-red-200',
                    reactivated: 'bg-green-50 text-green-800 border-green-200',
                    present: 'bg-blue-50 text-blue-700 border-blue-200',
                    unknown:
                      'bg-stm-warm-50 text-stm-warm-500 border-stm-warm-200',
                    'product-activity':
                      'bg-stm-sepia-50 text-stm-sepia-700 border-stm-sepia-200',
                  };

                  const colorKey =
                    ev.kind === 'product-activity'
                      ? 'product-activity'
                      : (ev.status ?? 'unknown');
                  const colorClass =
                    statusColors[colorKey] ?? statusColors.unknown;

                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs"
                    >
                      <span
                        className={`inline-block border px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${colorClass}`}
                      >
                        {ev.kind === 'product-activity'
                          ? ev.product
                          : ev.status}
                      </span>
                      {yearSpan && (
                        <span className="text-stm-warm-500 font-mono shrink-0">
                          {yearSpan}
                        </span>
                      )}
                      {ev.kind === 'product-activity' && (
                        <span className="text-stm-warm-400 text-[10px]">
                          (product)
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {computedLifecycleEvents.length === 0 &&
              statusAssertions.length === 0 && (
                <p className="text-xs text-stm-warm-400 italic">
                  No lifecycle events recorded. Add product observations or
                  status events to build the timeline.
                </p>
              )}

            {/* Editable status assertions */}
            {statusAssertions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-stm-warm-500 uppercase tracking-wider">
                  Status Events
                </p>
                {statusAssertions.map((assertion, i) => (
                  <div
                    key={assertion.id}
                    className="border border-stm-warm-200 bg-stm-warm-50 p-2 space-y-2"
                  >
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={assertion.status}
                        onChange={(e) =>
                          updateStatusAssertion(i, {
                            status: e.target.value as PlantationStatusType,
                          })
                        }
                        disabled={!canEdit}
                        className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                      >
                        <option value="planned">Planned</option>
                        <option value="built">Built / Active</option>
                        <option value="abandoned">Abandoned (verlaten)</option>
                        <option value="reactivated">Reactivated</option>
                        <option value="unknown">Unknown</option>
                      </select>
                      <input
                        type="number"
                        value={assertion.startYear ?? ''}
                        onChange={(e) =>
                          updateStatusAssertion(i, {
                            startYear: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                        disabled={!canEdit}
                        placeholder="From"
                        className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                      />
                      <input
                        type="number"
                        value={assertion.endYear ?? ''}
                        onChange={(e) =>
                          updateStatusAssertion(i, {
                            endYear: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                        disabled={!canEdit}
                        placeholder="To"
                        className="px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={assertion.source}
                        onChange={(e) =>
                          updateStatusAssertion(i, { source: e.target.value })
                        }
                        disabled={!canEdit}
                        className="flex-1 px-2 py-1 text-xs border border-stm-warm-200 bg-white focus:ring-1 focus:ring-stm-sepia-400 outline-none disabled:bg-stm-warm-50"
                      >
                        {registrySources.map((source) => (
                          <option key={source.sourceId} value={source.sourceId}>
                            {sourceDisplayLabel(source.sourceId)}
                          </option>
                        ))}
                      </select>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeStatusAssertion(i)}
                          className="text-xs text-stm-warm-400 hover:text-red-500 shrink-0"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
              disabled={
                saving ||
                draft.names.length === 0 ||
                !draft.names.some((n) => n.isPreferred && n.text.trim())
              }
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
                      `Delete "${getPreferredName(draft)}"? This cannot be undone.`,
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
