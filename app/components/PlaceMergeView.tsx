'use client';

import type {
  DiklandRef,
  ExternalLink,
  GazetteerPlace,
  PlaceName,
} from '@/lib/types';
import { getPreferredName } from '@/lib/types';
import dynamic from 'next/dynamic';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

const PlaceMergeMap = dynamic(() => import('./PlaceMergeMap'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type ScalarChoice = 'a' | 'b';

interface MergeResolution {
  type: ScalarChoice;
  description: ScalarChoice;
  location: ScalarChoice;
  fid: ScalarChoice;
  broader: ScalarChoice;
  district: ScalarChoice;
  excludedSources: Set<string>;
  excludedPsurIds: Set<string>;
  excludedExternalLinks: Set<string>; // JSON.stringify'd link objects
  excludedDiklandRefs: Set<string>; // JSON.stringify'd ref objects
  excludedAlmanakkenObservations: Set<string>; // observation record IDs
  excludedSranantongoNames: Set<string>;
  excludedLifecycleEvents: Set<string>; // event @ids
  excludedStatusAssertions: Set<string>; // assertion .id values
  excludedProductAssertions: Set<string>;
  excludedDistrictAssertions: Set<string>;
  excludedLocationAssertions: Set<string>;
}

interface MergedName {
  name: PlaceName;
  included: boolean;
  originIds: string[];
}

export interface PlaceMergeViewProps {
  placeA: GazetteerPlace;
  placeB: GazetteerPlace;
  organizationPeers: GazetteerPlace[];
  districts: GazetteerPlace[];
  canEdit: boolean;
  onMerge: (merged: GazetteerPlace, retiredIds: string[]) => Promise<void>;
  onKeepBoth: (qid: string, placeIds: string[]) => Promise<void>;
  onCancel: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function placeNameKey(name: PlaceName): string {
  return JSON.stringify([
    name.text.toLowerCase().trim(),
    name.language,
    name.type,
    name.source ?? null,
    name.sourceYear ?? null,
  ]);
}

function buildMergedNames(places: GazetteerPlace[]): MergedName[] {
  const result: MergedName[] = [];
  const indexByName = new Map<string, number>();
  let hasPreferredName = false;

  for (const place of places) {
    for (const name of place.names) {
      const key = placeNameKey(name);
      const existingIndex = indexByName.get(key);
      if (existingIndex != null) {
        result[existingIndex].originIds.push(place.id);
        continue;
      }
      const isPreferred: boolean = name.isPreferred && !hasPreferredName;
      if (isPreferred) hasPreferredName = true;
      indexByName.set(key, result.length);
      result.push({
        name: { ...name, isPreferred },
        included: true,
        originIds: [place.id],
      });
    }
  }

  return result;
}

function buildInitialResolution(): MergeResolution {
  return {
    type: 'a',
    description: 'a',
    location: 'a',
    fid: 'a',
    broader: 'a',
    district: 'a',
    excludedSources: new Set(),
    excludedPsurIds: new Set(),
    excludedExternalLinks: new Set(),
    excludedDiklandRefs: new Set(),
    excludedAlmanakkenObservations: new Set(),
    excludedSranantongoNames: new Set(),
    excludedLifecycleEvents: new Set(),
    excludedStatusAssertions: new Set(),
    excludedProductAssertions: new Set(),
    excludedDistrictAssertions: new Set(),
    excludedLocationAssertions: new Set(),
  };
}

function wikidataQid(place: GazetteerPlace): string | null {
  return (
    place.externalLinks.find(
      (link) => link.authority === 'wikidata' && /^Q\d+$/.test(link.identifier),
    )?.identifier ?? null
  );
}

function computeMergedPlace(
  places: GazetteerPlace[],
  primaryId: string,
  mergedNames: MergedName[],
  resolution: MergeResolution,
  usePairResolution: boolean,
): GazetteerPlace {
  const [placeA, placeB] = places;
  const primary = places.find((place) => place.id === primaryId) ?? placeA;
  const pick = <T,>(choice: ScalarChoice, va: T, vb: T): T =>
    choice === 'a' ? va : vb;

  const sources = [
    ...new Set(places.flatMap((place) => place.sources || [])),
  ].filter((source) => !resolution.excludedSources.has(source));

  const psurIds = [
    ...new Set(places.flatMap((place) => place.psurIds || [])),
  ].filter((id) => !resolution.excludedPsurIds.has(id));

  // Deduplicate only identical authority links; match type carries meaning.
  const seenLinks = new Set<string>();
  const externalLinks: ExternalLink[] = [];
  for (const l of places.flatMap((place) => place.externalLinks || [])) {
    const dedupeKey = JSON.stringify([l.authority, l.identifier, l.matchType]);
    const jsonKey = JSON.stringify(l);
    if (
      !seenLinks.has(dedupeKey) &&
      !resolution.excludedExternalLinks.has(jsonKey)
    ) {
      seenLinks.add(dedupeKey);
      externalLinks.push(l);
    }
  }

  // Deduplicate dikland refs by JSON equality
  const seenDikland = new Set<string>();
  const diklandRefs: DiklandRef[] = [];
  for (const r of places.flatMap((place) => place.diklandRefs || [])) {
    const key = JSON.stringify(r);
    if (!seenDikland.has(key) && !resolution.excludedDiklandRefs.has(key)) {
      seenDikland.add(key);
      diklandRefs.push(r);
    }
  }

  const almanakkenObservations = Array.from(
    new Map(
      places
        .flatMap((place) => place.almanakkenObservations || [])
        .map((observation) => [observation.recordId, observation]),
    ).values(),
  ).filter(
    (observation) =>
      !resolution.excludedAlmanakkenObservations.has(observation.recordId),
  );
  const sranantongoNames = [
    ...new Set(places.flatMap((place) => place.sranantongoNames || [])),
  ].filter((name) => !resolution.excludedSranantongoNames.has(name));
  const lifecycleEvents = Array.from(
    new Map(
      places
        .flatMap((place) => place.lifecycleEvents || [])
        .map((event) => [event['@id'], event]),
    ).values(),
  ).filter(
    (event) => !resolution.excludedLifecycleEvents.has(event['@id']),
  );

  return {
    ...primary,
    id: primary.id,
    names: mergedNames.filter((mn) => mn.included).map((mn) => mn.name),
    type: usePairResolution
      ? pick(resolution.type, placeA.type, placeB.type)
      : primary.type,
    description: usePairResolution
      ? pick(resolution.description, placeA.description, placeB.description)
      : primary.description,
    location: usePairResolution
      ? pick(resolution.location, placeA.location, placeB.location)
      : primary.location,
    fid: usePairResolution
      ? pick(resolution.fid, placeA.fid, placeB.fid)
      : primary.fid,
    broader: usePairResolution
      ? pick(resolution.broader, placeA.broader, placeB.broader)
      : primary.broader,
    district: usePairResolution
      ? pick(resolution.district, placeA.district, placeB.district)
      : primary.district,
    sources,
    psurIds,
    externalLinks,
    diklandRefs,
    almanakkenObservations,
    sranantongoNames,
    lifecycleEvents,
    statusAssertions: Array.from(
      new Map(
        places
          .flatMap((place) => place.statusAssertions || [])
          .map((assertion) => [assertion.id, assertion]),
      ).values(),
    ).filter((a) => !resolution.excludedStatusAssertions.has(a.id)),
    productAssertions: Array.from(
      new Map(
        places
          .flatMap((place) => place.productAssertions || [])
          .map((assertion) => [assertion.id, assertion]),
      ).values(),
    ).filter((a) => !resolution.excludedProductAssertions.has(a.id)),
    districtAssertions: Array.from(
      new Map(
        places
          .flatMap((place) => place.districtAssertions || [])
          .map((assertion) => [assertion.id, assertion]),
      ).values(),
    ).filter((a) => !resolution.excludedDistrictAssertions.has(a.id)),
    locationAssertions: Array.from(
      new Map(
        places
          .flatMap((place) => place.locationAssertions || [])
          .map((assertion) => [assertion.id, assertion]),
      ).values(),
    ).filter((a) => !resolution.excludedLocationAssertions.has(a.id)),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlaceCard({
  place,
  label,
  isPrimary,
  onSetPrimary,
}: {
  place: GazetteerPlace;
  label: string;
  isPrimary: boolean;
  onSetPrimary: () => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-4 border cursor-pointer transition-colors ${
        isPrimary
          ? 'border-stm-sepia-400 bg-stm-sepia-50'
          : 'border-stm-warm-200 bg-white hover:border-stm-warm-300'
      }`}
    >
      <input
        type="radio"
        checked={isPrimary}
        onChange={onSetPrimary}
        className="mt-1 accent-stm-sepia-500 shrink-0"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-stm-warm-500 uppercase tracking-wide">
            {label}
          </span>
          <span className="text-xs font-mono text-stm-warm-300">
            {place.id}
          </span>
        </div>
        <p className="font-medium text-stm-warm-800 truncate">
          {getPreferredName(place)}
        </p>
        <p className="text-xs text-stm-warm-500 mt-0.5 capitalize">
          {place.type}
        </p>
        {isPrimary && (
          <p className="text-xs text-stm-sepia-600 font-medium mt-1.5">
            Primary - this ID survives
          </p>
        )}
      </div>
    </label>
  );
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-stm-warm-400 mb-3">
      {children}
    </h3>
  );
}

function MergeFieldRow({
  valueA,
  valueB,
  choice,
  onChange,
}: {
  valueA: ReactNode;
  valueB: ReactNode;
  choice: ScalarChoice;
  onChange: (c: ScalarChoice) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_80px_1fr] gap-2 items-stretch">
      <button
        type="button"
        onClick={() => onChange('a')}
        className={`text-left p-3 border text-sm transition-colors ${
          choice === 'a'
            ? 'border-stm-sepia-400 bg-stm-sepia-50'
            : 'border-stm-warm-200 bg-white hover:border-stm-warm-300'
        }`}
      >
        {valueA ?? (
          <span className="text-stm-warm-300 italic text-xs">empty</span>
        )}
      </button>
      <div className="flex flex-col items-stretch justify-center gap-1.5 py-1">
        <button
          type="button"
          onClick={() => onChange('a')}
          className={`px-2 py-1 text-xs border transition-colors ${
            choice === 'a'
              ? 'bg-stm-sepia-500 text-white border-stm-sepia-500'
              : 'bg-white text-stm-warm-600 border-stm-warm-300 hover:border-stm-sepia-400'
          }`}
        >
          ← A
        </button>
        <button
          type="button"
          onClick={() => onChange('b')}
          className={`px-2 py-1 text-xs border transition-colors ${
            choice === 'b'
              ? 'bg-stm-sepia-500 text-white border-stm-sepia-500'
              : 'bg-white text-stm-warm-600 border-stm-warm-300 hover:border-stm-sepia-400'
          }`}
        >
          B →
        </button>
      </div>
      <button
        type="button"
        onClick={() => onChange('b')}
        className={`text-left p-3 border text-sm transition-colors ${
          choice === 'b'
            ? 'border-stm-sepia-400 bg-stm-sepia-50'
            : 'border-stm-warm-200 bg-white hover:border-stm-warm-300'
        }`}
      >
        {valueB ?? (
          <span className="text-stm-warm-300 italic text-xs">empty</span>
        )}
      </button>
    </div>
  );
}

function SameValueRow({ value }: { value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-3 border border-stm-warm-100 bg-stm-warm-50 text-sm">
      <span className="text-stm-warm-300 text-xs shrink-0">same in both</span>
      <div className="text-stm-warm-700">{value}</div>
    </div>
  );
}

function MergeArraySection<T>({
  items,
  keyFn,
  labelFn,
  excluded,
  onToggle,
}: {
  items: T[];
  keyFn: (item: T) => string;
  labelFn: (item: T) => ReactNode;
  excluded: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-stm-warm-300 italic">None</p>;
  }
  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const key = keyFn(item);
        const included = !excluded.has(key);
        return (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={included}
              onChange={() => onToggle(key)}
              className="accent-stm-sepia-500"
            />
            <span
              className={`text-sm ${included ? 'text-stm-warm-700' : 'text-stm-warm-300 line-through'}`}
            >
              {labelFn(item)}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlaceMergeView({
  placeA,
  placeB,
  organizationPeers,
  canEdit,
  onMerge,
  onKeepBoth,
  onCancel,
}: PlaceMergeViewProps) {
  const qidA = wikidataQid(placeA);
  const qidB = wikidataQid(placeB);
  const sharedOrganizationQid = qidA && qidA === qidB ? qidA : null;
  const confirmedPhysicalPlaces = useMemo(
    () => (sharedOrganizationQid ? organizationPeers : [placeA, placeB]),
    [organizationPeers, placeA, placeB, sharedOrganizationQid],
  );
  const confirmedPhysicalPlaceIds = useMemo(
    () => confirmedPhysicalPlaces.map((place) => place.id),
    [confirmedPhysicalPlaces],
  );
  const mergeCandidatePlaces = useMemo(() => {
    const candidates = new Map<string, GazetteerPlace>([
      [placeA.id, placeA],
      [placeB.id, placeB],
    ]);
    for (const place of confirmedPhysicalPlaces) candidates.set(place.id, place);
    return [...candidates.values()];
  }, [confirmedPhysicalPlaces, placeA, placeB]);
  const [mergeAction, setMergeAction] = useState<
    'merge' | 'keep-both' | null
  >(sharedOrganizationQid ? null : 'merge');
  const [selectedMergeIds, setSelectedMergeIds] = useState<string[]>([
    placeA.id,
    placeB.id,
  ]);
  const [primaryId, setPrimaryId] = useState(placeA.id);
  const [mergedNames, setMergedNames] = useState<MergedName[]>(() =>
    buildMergedNames([placeA, placeB]),
  );
  const [resolution, setResolution] = useState<MergeResolution>(
    buildInitialResolution,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMergePlaces = useMemo(
    () =>
      selectedMergeIds.flatMap((id) => {
        const place = mergeCandidatePlaces.find(
          (candidate) => candidate.id === id,
        );
        return place ? [place] : [];
      }),
    [mergeCandidatePlaces, selectedMergeIds],
  );
  const retiredIds = useMemo(
    () => selectedMergeIds.filter((id) => id !== primaryId),
    [primaryId, selectedMergeIds],
  );
  const usesDetailedPairResolution =
    selectedMergeIds.length === 2 &&
    selectedMergeIds.includes(placeA.id) &&
    selectedMergeIds.includes(placeB.id);

  const mergedPlace = useMemo(
    () =>
      computeMergedPlace(
        selectedMergePlaces,
        primaryId,
        mergedNames,
        resolution,
        usesDetailedPairResolution,
      ),
    [
      selectedMergePlaces,
      primaryId,
      mergedNames,
      resolution,
      usesDetailedPairResolution,
    ],
  );

  const toggleMergeCandidate = useCallback(
    (placeId: string) => {
      const isSelected = selectedMergeIds.includes(placeId);
      if (isSelected && selectedMergeIds.length <= 2) return;
      const next = isSelected
        ? selectedMergeIds.filter((id) => id !== placeId)
        : [...selectedMergeIds, placeId];
      const nextPrimaryId = next.includes(primaryId) ? primaryId : next[0];
      if (nextPrimaryId !== primaryId) setPrimaryId(nextPrimaryId);
      const orderedPlaces = next.flatMap((id) => {
        const place = mergeCandidatePlaces.find(
          (candidate) => candidate.id === id,
        );
        return place ? [place] : [];
      });
      const primaryIndex = orderedPlaces.findIndex(
        (place) => place.id === nextPrimaryId,
      );
      if (primaryIndex > 0) {
        const [primary] = orderedPlaces.splice(primaryIndex, 1);
        orderedPlaces.unshift(primary);
      }
      setMergedNames(buildMergedNames(orderedPlaces));
      setSelectedMergeIds(next);
    },
    [mergeCandidatePlaces, primaryId, selectedMergeIds],
  );

  const setScalar = useCallback(
    (
      field: keyof Pick<
        MergeResolution,
        | 'type'
        | 'description'
        | 'location'
        | 'fid'
        | 'broader'
        | 'district'
      >,
    ) =>
      (choice: ScalarChoice) =>
        setResolution((r) => ({ ...r, [field]: choice })),
    [],
  );

  const toggleArrayItem = useCallback(
    (
      field:
        | 'excludedSources'
        | 'excludedPsurIds'
        | 'excludedExternalLinks'
        | 'excludedDiklandRefs'
        | 'excludedAlmanakkenObservations'
        | 'excludedSranantongoNames'
        | 'excludedLifecycleEvents'
        | 'excludedStatusAssertions'
        | 'excludedProductAssertions'
        | 'excludedDistrictAssertions'
        | 'excludedLocationAssertions',
    ) =>
      (key: string) => {
        setResolution((r) => {
          const next = new Set(r[field]);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return { ...r, [field]: next };
        });
      },
    [],
  );

  const handleConfirm = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      if (mergeAction === 'keep-both' && sharedOrganizationQid) {
        await onKeepBoth(sharedOrganizationQid, confirmedPhysicalPlaceIds);
      } else if (mergeAction === 'merge') {
        await onMerge(mergedPlace, retiredIds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge');
      setSaving(false);
    }
  }, [
    mergeAction,
    mergedPlace,
    onKeepBoth,
    onMerge,
    confirmedPhysicalPlaceIds,
    retiredIds,
    sharedOrganizationQid,
  ]);

  // Derive union arrays for display
  const allSources = useMemo(
    () => [...new Set([...(placeA.sources || []), ...(placeB.sources || [])])],
    [placeA.sources, placeB.sources],
  );

  const allPsurIds = useMemo(
    () => [...new Set([...(placeA.psurIds || []), ...(placeB.psurIds || [])])],
    [placeA.psurIds, placeB.psurIds],
  );

  const allExternalLinks = useMemo(() => {
    const seen = new Set<string>();
    const result: ExternalLink[] = [];
    for (const l of [
      ...(placeA.externalLinks || []),
      ...(placeB.externalLinks || []),
    ]) {
      const key = JSON.stringify([l.authority, l.identifier, l.matchType]);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(l);
      }
    }
    return result;
  }, [placeA.externalLinks, placeB.externalLinks]);

  const allDiklandRefs = useMemo(() => {
    const seen = new Set<string>();
    const result: DiklandRef[] = [];
    for (const r of [
      ...(placeA.diklandRefs || []),
      ...(placeB.diklandRefs || []),
    ]) {
      const key = JSON.stringify(r);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(r);
      }
    }
    return result;
  }, [placeA.diklandRefs, placeB.diklandRefs]);

  const allAlmanakkenObservations = useMemo(
    () =>
      Array.from(
        new Map(
          [
            ...(placeA.almanakkenObservations || []),
            ...(placeB.almanakkenObservations || []),
          ].map((observation) => [observation.recordId, observation]),
        ).values(),
      ),
    [placeA.almanakkenObservations, placeB.almanakkenObservations],
  );

  const allSranantongoNames = useMemo(
    () =>
      Array.from(
        new Set([
          ...(placeA.sranantongoNames || []),
          ...(placeB.sranantongoNames || []),
        ]),
      ),
    [placeA.sranantongoNames, placeB.sranantongoNames],
  );

  const allLifecycleEvents = useMemo(
    () =>
      Array.from(
        new Map(
          [...(placeA.lifecycleEvents || []), ...(placeB.lifecycleEvents || [])].map(
            (event) => [event['@id'], event],
          ),
        ).values(),
      ),
    [placeA.lifecycleEvents, placeB.lifecycleEvents],
  );

  const allStatusAssertions = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(placeA.statusAssertions || []),
      ...(placeB.statusAssertions || []),
    ].filter((a) => (seen.has(a.id) ? false : seen.add(a.id) && true));
  }, [placeA.statusAssertions, placeB.statusAssertions]);

  const allProductAssertions = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(placeA.productAssertions || []),
      ...(placeB.productAssertions || []),
    ].filter((a) => (seen.has(a.id) ? false : seen.add(a.id) && true));
  }, [placeA.productAssertions, placeB.productAssertions]);

  const allDistrictAssertions = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(placeA.districtAssertions || []),
      ...(placeB.districtAssertions || []),
    ].filter((a) => (seen.has(a.id) ? false : seen.add(a.id) && true));
  }, [placeA.districtAssertions, placeB.districtAssertions]);

  const allLocationAssertions = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(placeA.locationAssertions || []),
      ...(placeB.locationAssertions || []),
    ].filter((a) => (seen.has(a.id) ? false : seen.add(a.id) && true));
  }, [placeA.locationAssertions, placeB.locationAssertions]);

  const includedNameCount = mergedNames.filter((n) => n.included).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-stm-warm-50">
      {/* Header */}
      <div className="border-b border-stm-warm-200 bg-white px-6 py-4 flex items-center justify-between shrink-0">
        <h2 className="text-xl font-serif font-bold text-stm-warm-800">
          Merge Places
        </h2>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm border border-stm-warm-300 text-stm-warm-600 bg-white hover:border-stm-warm-400 hover:text-stm-warm-800 transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">
          <section>
            <SectionHeader>Decide what the suggested records represent</SectionHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMergeAction('merge')}
                className={`border p-4 text-left transition-colors ${
                  mergeAction === 'merge'
                    ? 'border-stm-sepia-500 bg-stm-sepia-50'
                    : 'border-stm-warm-200 bg-white hover:border-stm-warm-300'
                }`}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    readOnly
                    checked={mergeAction === 'merge'}
                    className="mt-1 accent-stm-sepia-500"
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-stm-warm-800">
                      One physical plantation
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-stm-warm-500">
                      Combine only the records you select. One ID survives and
                      the others remain as provenance redirects.
                    </span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  sharedOrganizationQid && setMergeAction('keep-both')
                }
                disabled={!sharedOrganizationQid}
                className={`border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  mergeAction === 'keep-both'
                    ? 'border-stm-teal-500 bg-stm-teal-50'
                    : 'border-stm-warm-200 bg-white hover:border-stm-warm-300'
                }`}
              >
                <span className="flex items-start gap-3">
                  <span className="mt-0.5 flex gap-1" aria-hidden="true">
                    <input
                      type="checkbox"
                      readOnly
                      checked={mergeAction === 'keep-both'}
                      tabIndex={-1}
                      className="accent-stm-teal-600"
                    />
                    <input
                      type="checkbox"
                      readOnly
                      checked={mergeAction === 'keep-both'}
                      tabIndex={-1}
                      className="accent-stm-teal-600"
                    />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-stm-warm-800">
                      Multiple valid physical plantations
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-stm-warm-500">
                      Keep all {confirmedPhysicalPlaces.length} current records
                      and confirm that their E25 features are linked to the same
                      E74 organization
                      {sharedOrganizationQid
                        ? ` (${sharedOrganizationQid}).`
                        : '. This requires the same organization QID on both records.'}
                    </span>
                  </span>
                </span>
              </button>
            </div>
          </section>

          {mergeAction === 'keep-both' && (
            <section className="border border-stm-teal-200 bg-stm-teal-50 p-4">
              <h3 className="text-sm font-semibold text-stm-teal-900">
                All reviewed records will remain active
              </h3>
              <p className="mt-1 text-xs leading-5 text-stm-teal-800">
                This records a reviewed physical-link decision for the exact
                current set:{' '}
                {confirmedPhysicalPlaceIds.join(', ')}. Almanakken observations
                remain attached to organization {sharedOrganizationQid}; they
                are not duplicated as source assertions on the physical places.
              </p>
            </section>
          )}

          {mergeAction === 'merge' && mergeCandidatePlaces.length > 2 && (
            <section>
              <SectionHeader>Select the records to merge</SectionHeader>
              <p className="mb-3 text-xs leading-5 text-stm-warm-500">
                Select at least two. Records you leave unchecked remain active
                and are not changed by this merge.
              </p>
              <div className="space-y-2">
                {mergeCandidatePlaces.map((place) => {
                  const checked = selectedMergeIds.includes(place.id);
                  return (
                    <label
                      key={place.id}
                      className={`flex cursor-pointer items-start gap-3 border p-3 transition-colors ${
                        checked
                          ? 'border-stm-sepia-300 bg-stm-sepia-50'
                          : 'border-stm-warm-200 bg-white hover:border-stm-warm-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={checked && selectedMergeIds.length === 2}
                        onChange={() => toggleMergeCandidate(place.id)}
                        className="mt-1 accent-stm-sepia-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-stm-warm-800">
                          {getPreferredName(place)}
                        </span>
                        <span className="block font-mono text-xs text-stm-warm-400">
                          {place.id}
                        </span>
                      </span>
                      <span className="text-xs text-stm-warm-400">
                        {place.fid != null ? `FID ${place.fid}` : 'no FID'}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 text-xs font-medium text-stm-sepia-700">
                {selectedMergeIds.length} selected;{' '}
                {mergeCandidatePlaces.length - selectedMergeIds.length} left
                unchanged.
              </p>
            </section>
          )}

          <div className={mergeAction === 'keep-both' ? 'hidden' : 'contents'}>
            {/* Primary selection */}
            <section>
              <SectionHeader>
                Choose primary place - its ID survives
              </SectionHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                {selectedMergePlaces.map((place, index) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    label={String.fromCharCode(65 + index)}
                    isPrimary={primaryId === place.id}
                    onSetPrimary={() => setPrimaryId(place.id)}
                  />
                ))}
              </div>
            </section>

          {/* Names */}
          <section>
            <SectionHeader>
              Names &amp; alternative labels ({includedNameCount} kept)
            </SectionHeader>
            <p className="text-xs text-stm-warm-400 mb-3">
              All names from both entries: official, historical, vernacular, and
              variant spellings. Check to keep a name; use the radio button to
              set the preferred display name.
            </p>
            <div className="space-y-1.5">
              {mergedNames.map((mn, i) => {
                const originBadge =
                  mn.originIds.length === 1
                    ? mn.originIds[0]
                    : `${mn.originIds.length} records`;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 border border-stm-warm-100 bg-white"
                  >
                    <input
                      type="checkbox"
                      checked={mn.included}
                      onChange={() =>
                        setMergedNames((prev) =>
                          prev.map((n, j) =>
                            j === i ? { ...n, included: !n.included } : n,
                          ),
                        )
                      }
                      className="accent-stm-sepia-500 shrink-0"
                      aria-label={`Include name "${mn.name.text}"`}
                    />
                    <input
                      type="radio"
                      checked={mn.name.isPreferred}
                      onChange={() =>
                        setMergedNames((prev) =>
                          prev.map((n, j) => ({
                            ...n,
                            name: { ...n.name, isPreferred: j === i },
                          })),
                        )
                      }
                      title="Set as preferred name"
                      className="accent-stm-sepia-500 shrink-0"
                    />
                    <span
                      className={`flex-1 text-sm ${mn.included ? 'text-stm-warm-800' : 'text-stm-warm-300 line-through'}`}
                    >
                      {mn.name.text}
                    </span>
                    <span className="text-xs text-stm-warm-400">
                      {mn.name.language}
                    </span>
                    <span className="text-xs text-stm-warm-400">
                      {mn.name.type}
                    </span>
                    {mn.name.isPreferred && (
                      <span className="text-xs text-stm-sepia-600 font-medium">
                        preferred
                      </span>
                    )}
                    <span className="text-xs font-mono bg-stm-warm-100 text-stm-warm-500 px-1.5 py-0.5">
                      {originBadge}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {!usesDetailedPairResolution ? (
            <section className="border border-stm-sepia-200 bg-stm-sepia-50 p-4">
              <h3 className="text-sm font-semibold text-stm-sepia-900">
                Multi-record merge summary
              </h3>
              <p className="mt-1 text-xs leading-5 text-stm-sepia-800">
                The primary record supplies the surviving ID, description,
                type, district, coordinates, and GIS polygon. Names, source
                links, PSUR IDs, Dikland references, Almanakken observations,
                lifecycle events, and source assertions are deduplicated and
                preserved from all {selectedMergePlaces.length} selected records.
              </p>
              <p className="mt-2 text-xs leading-5 text-stm-sepia-800">
                Retiring: {retiredIds.join(', ')}. Leaving unchanged:{' '}
                {mergeCandidatePlaces
                  .filter((place) => !selectedMergeIds.includes(place.id))
                  .map((place) => place.id)
                  .join(', ') || 'none'}.
              </p>
            </section>
          ) : (
          <>
          {/* Type */}
          <section>
            <SectionHeader>Type</SectionHeader>
            {placeA.type === placeB.type ? (
              <SameValueRow
                value={<span className="capitalize">{placeA.type}</span>}
              />
            ) : (
              <MergeFieldRow
                valueA={<span className="capitalize">{placeA.type}</span>}
                valueB={<span className="capitalize">{placeB.type}</span>}
                choice={resolution.type}
                onChange={setScalar('type')}
              />
            )}
          </section>

          {/* Description */}
          {(placeA.description || placeB.description) && (
            <section>
              <SectionHeader>Description</SectionHeader>
              {placeA.description === placeB.description ? (
                <SameValueRow
                  value={
                    <span className="text-xs">
                      {placeA.description || (
                        <em className="text-stm-warm-300">empty</em>
                      )}
                    </span>
                  }
                />
              ) : (
                <MergeFieldRow
                  valueA={
                    placeA.description ? (
                      <span className="text-xs whitespace-pre-wrap">
                        {placeA.description}
                      </span>
                    ) : null
                  }
                  valueB={
                    placeB.description ? (
                      <span className="text-xs whitespace-pre-wrap">
                        {placeB.description}
                      </span>
                    ) : null
                  }
                  choice={resolution.description}
                  onChange={setScalar('description')}
                />
              )}
            </section>
          )}

          {/* Location */}
          <section>
            <SectionHeader>Location &amp; GIS polygon</SectionHeader>
            <p className="text-xs text-stm-warm-400 mb-3">
              Only one GIS polygon can be kept after the merge. Choose which
              place&apos;s coordinates and polygon to use.
            </p>
            <PlaceMergeMap
              locationA={placeA.location}
              locationB={placeB.location}
              nameA={getPreferredName(placeA)}
              nameB={getPreferredName(placeB)}
            />
            <div className="mt-3">
              {JSON.stringify(placeA.location) ===
              JSON.stringify(placeB.location) ? (
                <SameValueRow
                  value={
                    placeA.location.lat != null ? (
                      <span className="font-mono text-xs">
                        {placeA.location.lat.toFixed(4)},{' '}
                        {placeA.location.lng?.toFixed(4)}
                        {placeA.location.wkt && (
                          <span className="ml-2 text-stm-warm-400">
                            + polygon
                          </span>
                        )}
                      </span>
                    ) : (
                      <em className="text-stm-warm-300 text-xs">
                        no coordinates
                      </em>
                    )
                  }
                />
              ) : (
                <MergeFieldRow
                  valueA={
                    placeA.location.lat != null ? (
                      <span className="font-mono text-xs">
                        {placeA.location.lat.toFixed(4)},{' '}
                        {placeA.location.lng?.toFixed(4)}
                        {placeA.location.wkt && (
                          <span className="block text-stm-warm-400 text-[10px] mt-0.5">
                            + GIS polygon
                          </span>
                        )}
                      </span>
                    ) : null
                  }
                  valueB={
                    placeB.location.lat != null ? (
                      <span className="font-mono text-xs">
                        {placeB.location.lat.toFixed(4)},{' '}
                        {placeB.location.lng?.toFixed(4)}
                        {placeB.location.wkt && (
                          <span className="block text-stm-warm-400 text-[10px] mt-0.5">
                            + GIS polygon
                          </span>
                        )}
                      </span>
                    ) : null
                  }
                  choice={resolution.location}
                  onChange={setScalar('location')}
                />
              )}
            </div>
          </section>

          {/* GIS FID */}
          {(placeA.fid != null || placeB.fid != null) && (
            <section>
              <SectionHeader>GIS Feature ID (1930 map)</SectionHeader>
              {placeA.fid === placeB.fid ? (
                <SameValueRow
                  value={
                    <span className="font-mono text-xs">{placeA.fid}</span>
                  }
                />
              ) : (
                <MergeFieldRow
                  valueA={
                    placeA.fid != null ? (
                      <span className="font-mono text-xs">{placeA.fid}</span>
                    ) : null
                  }
                  valueB={
                    placeB.fid != null ? (
                      <span className="font-mono text-xs">{placeB.fid}</span>
                    ) : null
                  }
                  choice={resolution.fid}
                  onChange={setScalar('fid')}
                />
              )}
            </section>
          )}

          {/* Broader / District */}
          {(placeA.broader ||
            placeB.broader ||
            placeA.district ||
            placeB.district) && (
            <section>
              <SectionHeader>District / Broader context</SectionHeader>
              {placeA.broader === placeB.broader &&
              placeA.district === placeB.district ? (
                <SameValueRow
                  value={
                    <span className="text-xs">
                      {placeA.district || placeA.broader || '\u2014'}
                    </span>
                  }
                />
              ) : (
                <MergeFieldRow
                  valueA={
                    <span className="text-xs">
                      {placeA.district || placeA.broader || '\u2014'}
                    </span>
                  }
                  valueB={
                    <span className="text-xs">
                      {placeB.district || placeB.broader || '\u2014'}
                    </span>
                  }
                  choice={resolution.broader}
                  onChange={(c) =>
                    setResolution((r) => ({ ...r, broader: c, district: c }))
                  }
                />
              )}
            </section>
          )}

          {/* Sources */}
          {allSources.length > 0 && (
            <section>
              <SectionHeader>Sources (union)</SectionHeader>
              <MergeArraySection
                items={allSources}
                keyFn={(s) => s}
                labelFn={(s) => <span className="font-mono text-xs">{s}</span>}
                excluded={resolution.excludedSources}
                onToggle={toggleArrayItem('excludedSources')}
              />
            </section>
          )}

          {/* PSUR IDs */}
          {allPsurIds.length > 0 && (
            <section>
              <SectionHeader>PSUR IDs (union)</SectionHeader>
              <MergeArraySection
                items={allPsurIds}
                keyFn={(id) => id}
                labelFn={(id) => (
                  <span className="font-mono text-xs">{id}</span>
                )}
                excluded={resolution.excludedPsurIds}
                onToggle={toggleArrayItem('excludedPsurIds')}
              />
            </section>
          )}

          {/* External links */}
          {allExternalLinks.length > 0 && (
            <section>
              <SectionHeader>External Links (union)</SectionHeader>
              <MergeArraySection
                items={allExternalLinks}
                keyFn={(l) => JSON.stringify(l)}
                labelFn={(l) => (
                  <span className="text-xs">
                    <span className="font-semibold text-stm-warm-600">
                      {l.authority}
                    </span>
                    {': '}
                    <span className="font-mono">{l.identifier}</span>
                    <span className="text-stm-warm-400 ml-1">
                      ({l.matchType.replace('Match', '')})
                    </span>
                  </span>
                )}
                excluded={resolution.excludedExternalLinks}
                onToggle={toggleArrayItem('excludedExternalLinks')}
              />
            </section>
          )}

          {/* Dikland refs */}
          {allDiklandRefs.length > 0 && (
            <section>
              <SectionHeader>Dikland Collection Refs (union)</SectionHeader>
              <MergeArraySection
                items={allDiklandRefs}
                keyFn={(r) => JSON.stringify(r)}
                labelFn={(r) => (
                  <span className="text-xs">
                    {r.folderPath}
                    {r.author && (
                      <span className="text-stm-warm-400 ml-1">
                        - {r.author}
                      </span>
                    )}
                    {r.year && (
                      <span className="text-stm-warm-400 ml-1">({r.year})</span>
                    )}
                  </span>
                )}
                excluded={resolution.excludedDiklandRefs}
                onToggle={toggleArrayItem('excludedDiklandRefs')}
              />
            </section>
          )}

          {allAlmanakkenObservations.length > 0 && (
            <section>
              <SectionHeader>
                Almanakken observations (
                {allAlmanakkenObservations.length -
                  resolution.excludedAlmanakkenObservations.size}{' '}
                of {allAlmanakkenObservations.length} kept)
              </SectionHeader>
              <MergeArraySection
                items={allAlmanakkenObservations}
                keyFn={(observation) => observation.recordId}
                labelFn={(observation) => (
                  <span className="text-xs">
                    <span className="font-mono text-stm-warm-500">
                      {observation.year ?? '-'}
                    </span>{' '}
                    {observation.plantationOriginal ||
                      observation.plantationStandardized ||
                      observation.recordId}
                  </span>
                )}
                excluded={resolution.excludedAlmanakkenObservations}
                onToggle={toggleArrayItem('excludedAlmanakkenObservations')}
              />
            </section>
          )}

          {allSranantongoNames.length > 0 && (
            <section>
              <SectionHeader>
                Sranan Tongo names (
                {allSranantongoNames.length -
                  resolution.excludedSranantongoNames.size}{' '}
                of {allSranantongoNames.length} kept)
              </SectionHeader>
              <MergeArraySection
                items={allSranantongoNames}
                keyFn={(name) => name}
                labelFn={(name) => <span className="text-xs">{name}</span>}
                excluded={resolution.excludedSranantongoNames}
                onToggle={toggleArrayItem('excludedSranantongoNames')}
              />
            </section>
          )}

          {allLifecycleEvents.length > 0 && (
            <section>
              <SectionHeader>
                Lifecycle events (
                {allLifecycleEvents.length -
                  resolution.excludedLifecycleEvents.size}{' '}
                of {allLifecycleEvents.length} kept)
              </SectionHeader>
              <MergeArraySection
                items={allLifecycleEvents}
                keyFn={(event) => event['@id']}
                labelFn={(event) => (
                  <span className="text-xs">
                    {event.prefLabel}
                    {event.startYear != null && (
                      <span className="ml-1.5 font-mono text-stm-warm-400">
                        {event.startYear}
                      </span>
                    )}
                  </span>
                )}
                excluded={resolution.excludedLifecycleEvents}
                onToggle={toggleArrayItem('excludedLifecycleEvents')}
              />
            </section>
          )}

          {/* Status assertions */}
          {allStatusAssertions.length > 0 && (
            <section>
              <SectionHeader>
                Lifecycle status (
                {allStatusAssertions.length -
                  resolution.excludedStatusAssertions.size}{' '}
                of {allStatusAssertions.length} kept)
              </SectionHeader>
              <p className="text-xs text-stm-warm-400 mb-2">
                records of when this place was built, active, or abandoned, each
                tied to a specific source and time period.
              </p>
              <MergeArraySection
                items={allStatusAssertions}
                keyFn={(a) => a.id}
                labelFn={(a) => (
                  <span className="text-xs">
                    <span className="font-semibold text-stm-warm-700 capitalize">
                      {a.status}
                    </span>
                    {(a.startYear || a.endYear) && (
                      <span className="text-stm-warm-400 ml-1.5">
                        {a.startYear}
                        {a.endYear && a.endYear !== a.startYear
                          ? `\u2013${a.endYear}`
                          : ''}
                      </span>
                    )}
                    <span className="font-mono text-stm-warm-300 ml-1.5 text-[10px]">
                      {a.source}
                    </span>
                  </span>
                )}
                excluded={resolution.excludedStatusAssertions}
                onToggle={toggleArrayItem('excludedStatusAssertions')}
              />
            </section>
          )}

          {/* Product assertions */}
          {allProductAssertions.length > 0 && (
            <section>
              <SectionHeader>
                Crops &amp; products (
                {allProductAssertions.length -
                  resolution.excludedProductAssertions.size}{' '}
                of {allProductAssertions.length} kept)
              </SectionHeader>
              <p className="text-xs text-stm-warm-400 mb-2">
                What was cultivated or produced here, as recorded per source and
                year in the Surinaamse Almanakken.
              </p>
              <MergeArraySection
                items={allProductAssertions}
                keyFn={(a) => a.id}
                labelFn={(a) => (
                  <span className="text-xs">
                    <span className="font-semibold text-stm-warm-700 capitalize">
                      {a.value}
                    </span>
                    {(a.startYear || a.endYear) && (
                      <span className="text-stm-warm-400 ml-1.5">
                        {a.startYear}
                        {a.endYear && a.endYear !== a.startYear
                          ? `\u2013${a.endYear}`
                          : ''}
                      </span>
                    )}
                    <span className="font-mono text-stm-warm-300 ml-1.5 text-[10px]">
                      {a.source}
                    </span>
                  </span>
                )}
                excluded={resolution.excludedProductAssertions}
                onToggle={toggleArrayItem('excludedProductAssertions')}
              />
            </section>
          )}

          {/* District assertions */}
          {allDistrictAssertions.length > 0 && (
            <section>
              <SectionHeader>
                District membership (
                {allDistrictAssertions.length -
                  resolution.excludedDistrictAssertions.size}{' '}
                of {allDistrictAssertions.length} kept)
              </SectionHeader>
              <p className="text-xs text-stm-warm-400 mb-2">
                Which administrative district this place belonged to, per
                source. District boundaries changed over time.
              </p>
              <MergeArraySection
                items={allDistrictAssertions}
                keyFn={(a) => a.id}
                labelFn={(a) => (
                  <span className="text-xs">
                    <span className="font-semibold text-stm-warm-700">
                      {a.districtLabel || a.districtId || '\u2014'}
                    </span>
                    {a.sourceYear && (
                      <span className="text-stm-warm-400 ml-1.5">
                        {a.sourceYear}
                      </span>
                    )}
                    <span className="font-mono text-stm-warm-300 ml-1.5 text-[10px]">
                      {a.source}
                    </span>
                    {a.certainty && a.certainty !== 'certain' && (
                      <span className="text-stm-warm-300 ml-1 italic">
                        {a.certainty}
                      </span>
                    )}
                  </span>
                )}
                excluded={resolution.excludedDistrictAssertions}
                onToggle={toggleArrayItem('excludedDistrictAssertions')}
              />
            </section>
          )}

          {/* Location assertions */}
          {allLocationAssertions.length > 0 && (
            <section>
              <SectionHeader>
                Historical location descriptions (
                {allLocationAssertions.length -
                  resolution.excludedLocationAssertions.size}{' '}
                of {allLocationAssertions.length} kept)
              </SectionHeader>
              <p className="text-xs text-stm-warm-400 mb-2">
                Textual location descriptions copied from historical sources,
                e.g. &ldquo;op de Commewijne rivier&rdquo;.
              </p>
              <MergeArraySection
                items={allLocationAssertions}
                keyFn={(a) => a.id}
                labelFn={(a) => (
                  <span className="text-xs">
                    <span className="text-stm-warm-700">
                      {a.standardized || a.original || '\u2014'}
                    </span>
                    {a.startYear && (
                      <span className="text-stm-warm-400 ml-1.5">
                        {a.startYear}
                      </span>
                    )}
                    <span className="font-mono text-stm-warm-300 ml-1.5 text-[10px]">
                      {a.source}
                    </span>
                  </span>
                )}
                excluded={resolution.excludedLocationAssertions}
                onToggle={toggleArrayItem('excludedLocationAssertions')}
              />
            </section>
          )}
          </>
          )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-stm-warm-200 bg-white px-6 py-4 flex items-center justify-between shrink-0">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !canEdit ? (
          <p className="text-sm text-stm-warm-400">
            Sign in with GitHub to save a merge.
          </p>
        ) : mergeAction === 'keep-both' ? (
          <p className="text-sm text-stm-warm-500">
            Keeping all {confirmedPhysicalPlaceIds.length} reviewed records
          </p>
        ) : (
          <p className="text-sm text-stm-warm-500">
            Merging{' '}
            <span className="font-mono font-medium">
              {retiredIds.join(', ')}
            </span>{' '}
            into <span className="font-mono font-medium">{primaryId}</span>
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm border border-stm-warm-300 text-stm-warm-600 bg-white hover:border-stm-warm-400 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={
              saving ||
              !mergeAction ||
              (mergeAction === 'merge' && selectedMergeIds.length < 2) ||
              (mergeAction === 'merge' && includedNameCount === 0) ||
              !canEdit
            }
            title={!canEdit ? 'Sign in with GitHub to save' : undefined}
            className="px-4 py-2 text-sm font-medium bg-stm-sepia-600 text-white hover:bg-stm-sepia-700 disabled:opacity-50 transition-colors"
          >
            {saving
              ? mergeAction === 'keep-both'
                ? 'Confirming...'
                : 'Merging...'
              : mergeAction === 'keep-both'
                ? `Confirm ${confirmedPhysicalPlaceIds.length} Places`
                : `Merge ${selectedMergeIds.length} Selected`}
          </button>
        </div>
      </div>
    </div>
  );
}
