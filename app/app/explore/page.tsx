'use client';

import ExplorationSummary from '@/components/ExplorationSummary';
import type { YearRange } from '@/components/RecordedYearsFilter';
import { getGeoJSON } from '@/lib/data';
import type { RankedPersonHit } from '@/lib/person-search';
import type { GeoJSONCollection, GeoJSONFeature } from '@/lib/types';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  extractPlaceId,
  parseExploreParams,
} from '@/lib/url';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

function matchesYears(years: number[], [from, to]: YearRange): boolean {
  return years.some((year) => year >= from && year <= to);
}

export default function ExplorePage() {
  return (
    <Suspense>
      <ExplorePageInner />
    </Suspense>
  );
}

function ExplorePageInner() {
  const searchParams = useSearchParams();
  const urlParams = parseExploreParams(searchParams);

  const [geojson, setGeojson] = useState<GeoJSONCollection | null>(null);
  const [person, setPerson] = useState<RankedPersonHit | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<GeoJSONFeature | null>(
    null,
  );
  const [highlightedName, setHighlightedName] = useState<string | null>(null);
  const [highlightedPlaceIds, setHighlightedPlaceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const lastAppliedPlace = useRef<string | null>(null);

  const [yearRange, setYearRange] = useState<YearRange | null>(null);
  const deferredRange = useDeferredValue(yearRange);
  const yearBounds = useMemo<YearRange | null>(() => {
    const years = new Set(geojson?.features.flatMap(({ properties }) => properties.recordedYears ?? []));
    return years.size ? [Math.min(...years), Math.max(...years)] : null;
  }, [geojson]);
  const visibleGeojson = useMemo(() => {
    if (!geojson || !deferredRange) return geojson;
    return {
      ...geojson,
      features: geojson.features.filter(({ properties }) =>
        matchesYears(properties.recordedYears ?? [], deferredRange),
      ),
    };
  }, [geojson, deferredRange]);

  // Compute initial viewport from URL params
  const initialCenter: [number, number] =
    urlParams.lat != null && urlParams.lng != null
      ? [urlParams.lat, urlParams.lng]
      : DEFAULT_CENTER;
  const initialZoom = urlParams.z ?? DEFAULT_ZOOM;

  useEffect(() => {
    getGeoJSON()
      .then((collection) => setGeojson(Array.isArray(collection.features) ? collection : null))
      .catch(() => setGeojson(null))
      .finally(() => setLoading(false));
  }, []);

  // Initialize/update selected feature from ?place= param
  useEffect(() => {
    if (!geojson) return;
    const placeParam = urlParams.place;
    if (placeParam === lastAppliedPlace.current) return;
    lastAppliedPlace.current = placeParam;
    if (placeParam) {
      const feature = geojson.features.find(
        (f) =>
          f.properties.stmId === placeParam ||
          extractPlaceId(f.properties.placeUri) === placeParam ||
          extractPlaceId(f.properties.plantationUri) === placeParam ||
          extractPlaceId(f.properties.featureUri) === placeParam ||
          f.id === placeParam,
      );
      if (feature) {
        setSelectedFeature(feature);
        setHighlightedName(feature.properties.name);
      }
    }
  }, [geojson, urlParams.place]);

  // Sync selection and viewport to URL (replaceState to avoid history pollution)
  const syncUrl = useCallback(
    (placeId: string | null, center?: [number, number], zoom?: number) => {
      const params = new URLSearchParams(window.location.search);
      if (placeId) {
        params.set('place', placeId);
      } else {
        params.delete('place');
      }
      if (center && zoom != null) {
        params.set('lat', center[0].toFixed(4));
        params.set('lng', center[1].toFixed(4));
        params.set('z', String(Math.round(zoom)));
      }
      const qs = params.toString();
      const basePath = window.location.pathname;
      const newUrl = qs ? `${basePath}?${qs}` : basePath;
      window.history.replaceState(null, '', newUrl);
    },
    [],
  );

  const handleSelectPlantation = useCallback(
    (feature: GeoJSONFeature) => {
      setPerson(null);
      setSelectedFeature(feature);
      setHighlightedName(feature.properties.name);
      setHighlightedPlaceIds([]);
      const placeId =
        feature.properties.stmId ??
        extractPlaceId(
          feature.properties.placeUri ??
            feature.properties.plantationUri ??
            feature.properties.featureUri ??
            feature.id,
        );
      syncUrl(placeId);
    },
    [syncUrl],
  );

  const handleSelectPerson = useCallback((hit: RankedPersonHit) => {
    setSelectedFeature(null);
    setPerson(hit);
    setHighlightedName(null);
    setHighlightedPlaceIds(hit.placeIds);
    syncUrl(null);
  }, [syncUrl]);

  const handleHighlightName = useCallback((name: string) => {
    setSelectedFeature(null);
    setPerson(null);
    setHighlightedName(name);
    setHighlightedPlaceIds([]);
    syncUrl(null);
  }, [syncUrl]);

  const handleHighlightPlaces = useCallback((placeIds: string[]) => {
    setSelectedFeature(null);
    setPerson(null);
    setHighlightedPlaceIds(placeIds);
    setHighlightedName(null);
    syncUrl(null);
  }, [syncUrl]);

  const handleClose = useCallback(() => {
    setPerson(null);
    setSelectedFeature(null);
    setHighlightedName(null);
    setHighlightedPlaceIds([]);
    syncUrl(null);
  }, [syncUrl]);

  function handleYearRangeChange(range: YearRange | null) {
    setYearRange(range);
    if (range && (
      (selectedFeature && !matchesYears(selectedFeature.properties.recordedYears ?? [], range)) ||
      (person && !matchesYears(person.years, range))
    )) {
      handleClose();
    }
  }

  const handleViewportChange = useCallback(
    (center: [number, number], zoom: number) => {
      const currentPlaceId = (() => {
        const p = new URLSearchParams(window.location.search);
        return p.get('place');
      })();
      syncUrl(currentPlaceId, center, zoom);
    },
    [syncUrl],
  );

  /* Keyboard shortcut: Escape closes panel */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && (selectedFeature || person) && !e.defaultPrevented) {
        handleClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFeature, person, handleClose]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-8rem)] flex-1 items-center justify-center px-4">
        <section
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="w-full max-w-4xl site-panel p-5"
        >
          <div className="site-kicker mb-4">
            Loading the historical map
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="h-20 animate-pulse bg-ink/5" />
            <div className="h-20 animate-pulse bg-ink/5" />
            <div className="h-20 animate-pulse bg-ink/5" />
            <div className="h-20 animate-pulse bg-ink/5" />
          </div>
          <div className="mt-4 h-56 animate-pulse bg-ink/5" />
        </section>
      </div>
    );
  }

  if (!geojson) {
    return (
      <div className="mx-auto flex max-w-lg flex-1 flex-col items-start justify-center gap-3 p-6">
        <h1 className="text-2xl font-semibold">Explore Suriname’s history</h1>
        <p role="status">The historical map could not be loaded.</p>
        <button className="site-panel px-4 py-2" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100dvh-8rem)] w-full flex-1">
      {/* Map fills all available space — never resizes */}
      <div className="absolute inset-0">
        <MapView
          geojson={visibleGeojson}
          yearBounds={yearBounds}
          yearRange={yearRange}
          searchYearRange={deferredRange}
          onYearRangeChange={handleYearRangeChange}
          selectedPlantationUri={
            selectedFeature?.properties.plantationUri ??
            selectedFeature?.properties.featureUri ??
            selectedFeature?.properties.placeUri ??
            selectedFeature?.id ??
            null
          }
          selectedFeatureType={selectedFeature?.properties.featureType}
          highlightedName={highlightedName}
          highlightedPlaceIds={highlightedPlaceIds}
          panelOpen={!!(selectedFeature || person)}
          onSelectPerson={handleSelectPerson}
          onSelectPlantation={handleSelectPlantation}
          onHighlightName={handleHighlightName}
          onHighlightPlaces={handleHighlightPlaces}
          initialCenter={initialCenter}
          initialZoom={initialZoom}
          onViewportChange={handleViewportChange}
        />
      </div>

      {/* Detail panel overlays the map from the right */}
      {(selectedFeature || person) && (
        <ExplorationSummary
          key={selectedFeature ? `place-${selectedFeature.id}` : `person-${person?.display ?? ''}`}
          feature={selectedFeature}
          person={person}
          features={visibleGeojson?.features ?? geojson.features}
          yearRange={deferredRange}
          onSelectPlace={handleSelectPlantation}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
