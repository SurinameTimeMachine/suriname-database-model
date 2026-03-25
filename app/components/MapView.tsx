'use client';

import 'leaflet/dist/leaflet.css';
import type { GeoJSONCollection, GeoJSONFeature } from '@/lib/types';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';

const ANNOTATION_URL =
  'https://surinametijdmachine.org/iiif/mapathon/kaart-van-suriname-1930.json';

interface MapViewProps {
  geojson: GeoJSONCollection | null;
  selectedPlantationUri: string | null;
  onSelectPlantation: (feature: GeoJSONFeature) => void;
}

export default function MapView({
  geojson,
  selectedPlantationUri,
  onSelectPlantation,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const warpedLayerRef = useRef<L.Layer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [opacity, setOpacity] = useState(0.7);
  const [overlayVisible, setOverlayVisible] = useState(true);

  // Initialize map
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [5.5, -55.2],
      zoom: 8,
      zoomControl: true,
      zoomAnimationThreshold: 1,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    // Add 1930 historical map overlay via Allmaps
    import('@allmaps/leaflet').then(({ WarpedMapLayer }) => {
      const warpedMapLayer = new WarpedMapLayer(ANNOTATION_URL, {
        opacity: 0.7,
      });
      warpedMapLayer.addTo(map);
      warpedLayerRef.current = warpedMapLayer;
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      warpedLayerRef.current = null;
    };
  }, []);

  // Add/update GeoJSON layer
  useEffect(() => {
    if (!mapRef.current || !geojson) return;

    if (layerRef.current) {
      layerRef.current.remove();
    }

    const layer = L.geoJSON(geojson as unknown as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const props = feature?.properties;
        const isSelected = props?.plantationUri === selectedPlantationUri;
        const isBuilt = props?.status === 'built';
        return {
          fillColor: isSelected ? '#eab308' : isBuilt ? '#3b82f6' : '#9ca3af',
          fillOpacity: isSelected ? 0.6 : 0.3,
          color: isSelected ? '#eab308' : isBuilt ? '#2563eb' : '#6b7280',
          weight: isSelected ? 3 : 1,
        };
      },
      onEachFeature: (feature, featureLayer) => {
        const props = feature.properties;
        featureLayer.bindTooltip(props.name || 'Unknown', {
          sticky: true,
          className: 'plantation-tooltip',
        });

        featureLayer.on('click', () => {
          onSelectPlantation(feature as unknown as GeoJSONFeature);
        });

        featureLayer.on('mouseover', (e) => {
          const target = e.target as L.Path;
          if (props.plantationUri !== selectedPlantationUri) {
            target.setStyle({ fillOpacity: 0.5, weight: 2 });
          }
        });

        featureLayer.on('mouseout', (e) => {
          const target = e.target as L.Path;
          if (props.plantationUri !== selectedPlantationUri) {
            layer.resetStyle(target);
          }
        });
      },
    });

    layer.addTo(mapRef.current);
    layerRef.current = layer;
  }, [geojson, selectedPlantationUri, onSelectPlantation]);

  // Sync overlay opacity
  useEffect(() => {
    const layer = warpedLayerRef.current;
    if (!layer) return;
    if ('setOpacity' in layer) {
      (layer as unknown as { setOpacity: (o: number) => void }).setOpacity(
        overlayVisible ? opacity : 0,
      );
    }
  }, [opacity, overlayVisible]);

  // Fly to selected plantation
  useEffect(() => {
    if (!mapRef.current || !layerRef.current || !selectedPlantationUri) return;

    layerRef.current.eachLayer((layer) => {
      const feature = (layer as L.GeoJSON & { feature?: GeoJSONFeature })
        .feature;
      if (feature?.properties?.plantationUri === selectedPlantationUri) {
        const bounds = (layer as L.Polygon).getBounds();
        mapRef.current!.flyToBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      }
    });
  }, [selectedPlantationUri]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-6 right-3 z-1000 bg-white rounded-lg shadow-md p-3 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={overlayVisible}
            onChange={(e) => setOverlayVisible(e.target.checked)}
            className="accent-amber-600"
          />
          <span className="font-medium text-gray-700">1930 Map</span>
        </label>
        {overlayVisible && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            className="w-full mt-2 accent-amber-600"
          />
        )}
      </div>
    </div>
  );
}
