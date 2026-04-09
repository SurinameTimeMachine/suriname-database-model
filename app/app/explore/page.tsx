'use client';

import PlantationPanel from '@/components/PlantationPanel';
import type { AllData } from '@/lib/data';
import { loadAllData } from '@/lib/data';
import type { GeoJSONFeature } from '@/lib/types';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function ExplorePage() {
  const [data, setData] = useState<AllData | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<GeoJSONFeature | null>(
    null,
  );
  const [highlightedName, setHighlightedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllData()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const handleSelectPlantation = useCallback((feature: GeoJSONFeature) => {
    setSelectedFeature(feature);
    setHighlightedName(feature.properties.name);
  }, []);

  const handleHighlightName = useCallback((name: string) => {
    setHighlightedName(name);
    setSelectedFeature(null);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedFeature(null);
    setHighlightedName(null);
  }, []);

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
      <div className="w-full h-full flex items-center justify-center bg-stm-warm-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-stm-sepia-400 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-stm-warm-500 text-sm">
            Loading plantation data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      {/* Map fills all available space — never resizes */}
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
      />

      {/* Detail panel overlays the map from the right */}
      <PlantationPanel
        feature={selectedFeature}
        data={data}
        onClose={handleClose}
      />
    </div>
  );
}
