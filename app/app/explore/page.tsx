'use client';

import PlantationPanel from '@/components/PlantationPanel';
import type { AllData } from '@/lib/data';
import { loadAllData } from '@/lib/data';
import type { GeoJSONFeature } from '@/lib/types';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  extractPlaceId,
  parseExploreParams,
} from '@/lib/url';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

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

  const [data, setData] = useState<AllData | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<GeoJSONFeature | null>(
    null,
  );
  const [highlightedName, setHighlightedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastAppliedPlace = useRef<string | null>(null);

  // Compute initial viewport from URL params
  const initialCenter: [number, number] =
    urlParams.lat != null && urlParams.lng != null
      ? [urlParams.lat, urlParams.lng]
      : DEFAULT_CENTER;
  const initialZoom = urlParams.z ?? DEFAULT_ZOOM;

  useEffect(() => {
    loadAllData()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  // Initialize/update selected feature from ?place= param
  useEffect(() => {
    if (!data?.geojson) return;
    const placeParam = urlParams.place;
    if (placeParam === lastAppliedPlace.current) return;
    lastAppliedPlace.current = placeParam;
    if (placeParam) {
      const feature = data.geojson.features.find(
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
  }, [data, urlParams.place]);

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
      setSelectedFeature(feature);
      setHighlightedName(feature.properties.name);
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

  const handleHighlightName = useCallback((name: string) => {
    setHighlightedName(name);
    setSelectedFeature(null);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedFeature(null);
    setHighlightedName(null);
    syncUrl(null);
  }, [syncUrl]);

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
      if (e.key === 'Escape' && selectedFeature) {
        handleClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFeature, handleClose]);

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
            Loading plantation data
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

  return (
    <div className="relative min-h-[calc(100dvh-8rem)] w-full flex-1">
      {/* Map fills all available space — never resizes */}
      <div className="absolute inset-0">
        <MapView
          geojson={data?.geojson || null}
          selectedPlantationUri={
            selectedFeature?.properties.plantationUri ??
            selectedFeature?.properties.featureUri ??
            selectedFeature?.properties.placeUri ??
            null
          }
          highlightedName={highlightedName}
          panelOpen={!!selectedFeature}
          onSelectPlantation={handleSelectPlantation}
          onHighlightName={handleHighlightName}
          initialCenter={initialCenter}
          initialZoom={initialZoom}
          onViewportChange={handleViewportChange}
        />
      </div>

      {/* Detail panel overlays the map from the right */}
      <PlantationPanel
        feature={selectedFeature}
        data={data}
        onClose={handleClose}
      />
    </div>
  );
}
