'use client';

import 'leaflet/dist/leaflet.css';
import type { GeoJSONCollection, GeoJSONFeature } from '@/lib/types';
import { usePlaceTypes } from '@/lib/thesaurus';
import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';

const TRANSFORMATION_LABELS: Record<string, string> = {
  helmert: 'Helmert',
  polynomial: 'Polynomial 1',
  polynomial2: 'Polynomial 2',
  polynomial3: 'Polynomial 3',
  thinPlateSpline: 'Thin Plate Spline',
  projective: 'Projective',
};

interface OverlayConfig {
  id: string;
  label: string;
  annotationUrl?: string;
  annotationUrls?: string[];
  defaultEnabled: boolean;
  transformation: string;
  gcpCount: number | string;
}

const OVERLAY_CONFIGS: OverlayConfig[] = [
  {
    id: '1930-plantation',
    label: '1930 Plantation Map',
    annotationUrls: [
      'https://annotations.allmaps.org/maps/d9191cafde1831f0', // sheet 3
      'https://annotations.allmaps.org/maps/dc967c11ce9e86b3', // sheet 4
      'https://annotations.allmaps.org/maps/edaf1bbc8b86f0bf', // sheet 5
      'https://annotations.allmaps.org/maps/9eac27facff8687f', // sheet 6
      'https://annotations.allmaps.org/maps/5e0b6889ed3816d9', // sheet 7
      'https://annotations.allmaps.org/maps/aacef031cb456d2a', // sheet 8
      'https://annotations.allmaps.org/maps/4d07f0d3bf9fc347', // sheet 9
      // sheet 10 (1d7e4a0bd68f039c) excluded — smaller size, fewer GCPs, causes overlap
      'https://annotations.allmaps.org/maps/ddd8d3ca24e1916a', // sheet 11
    ],
    defaultEnabled: true,
    transformation: 'thinPlateSpline',
    gcpCount: '10-80/sheet',
  },
  {
    id: '1930-plantation-onemanifest',
    label: '1930 Plantation Map (One Manifest)',
    annotationUrl: 'https://annotations.allmaps.org/manifests/5178b46e14dc211e',
    defaultEnabled: false,
    transformation: 'thinPlateSpline',
    gcpCount: 'unknown',
  },
  {
    id: '1930-plantation-neat',
    label: '1930 Plantation Map (Neat)',
    annotationUrl:
      'https://surinametijdmachine.org/iiif/mapathon/kaart-van-suriname-1930.json',
    defaultEnabled: false,
    transformation: 'thinPlateSpline',
    gcpCount: '2-4/sheet',
  },
  {
    id: 'moseberg-sheet2-1801',
    label: 'Moseberg Specialkaart Sheet 2 (1801)',
    annotationUrl: 'https://annotations.allmaps.org/maps/e0aa5e7cc7db6914',
    defaultEnabled: false,
    transformation: 'polynomial',
    gcpCount: '40+',
  },
  {
    id: 'moseberg-sheet1-1801',
    label: 'Moseberg Specialkaart Sheet 1 (1801)',
    annotationUrl: 'https://annotations.allmaps.org/maps/3fba2200df3c3238',
    defaultEnabled: false,
    transformation: 'polynomial',
    gcpCount: '40+',
  },
  {
    id: 'leiden-map',
    label: 'Leiden Map',
    annotationUrl: 'https://annotations.allmaps.org/maps/ae8e71fd2a418647',
    defaultEnabled: false,
    transformation: 'helmert',
    gcpCount: '60+',
  },
  {
    id: 'suriname-sheet10',
    label: 'Kaart van Suriname Sheet 10',
    annotationUrl: 'https://annotations.allmaps.org/maps/1d7e4a0bd68f039c',
    defaultEnabled: false,
    transformation: 'thinPlateSpline',
    gcpCount: 10,
  },
  {
    id: 'plantages-acaribo',
    label: 'Plantages Acaribo / Waterlandt',
    annotationUrl: 'https://annotations.allmaps.org/maps/6875d89dfd2c9ca3',
    defaultEnabled: false,
    transformation: 'polynomial',
    gcpCount: 4,
  },
  {
    id: 'suriname-sheet15',
    label: 'Suriname Sheet 15',
    annotationUrl: 'https://annotations.allmaps.org/maps/8ec98ae6c0d3d026',
    defaultEnabled: false,
    transformation: 'polynomial',
    gcpCount: 5,
  },
  {
    id: 'suriname-sheet12',
    label: 'Suriname Sheet 12',
    annotationUrl: 'https://annotations.allmaps.org/maps/b47e3f6dd466fdbf',
    defaultEnabled: false,
    transformation: 'polynomial',
    gcpCount: 4,
  },
  {
    id: 'suriname-sheet14',
    label: 'Suriname Sheet 14',
    annotationUrl: 'https://annotations.allmaps.org/maps/c97e6355090dc3ff',
    defaultEnabled: false,
    transformation: 'polynomial',
    gcpCount: 3,
  },
  {
    id: 'suriname-sheet2',
    label: 'Suriname Sheet 2',
    annotationUrl: 'https://annotations.allmaps.org/maps/509483f1a7a3062e',
    defaultEnabled: false,
    transformation: 'polynomial',
    gcpCount: 6,
  },
  {
    id: 'suriname-sheet5',
    label: 'Suriname Sheet 5',
    annotationUrl: 'https://annotations.allmaps.org/maps/5a318015b1228204',
    defaultEnabled: false,
    transformation: 'polynomial',
    gcpCount: 5,
  },
  {
    id: 'suriname-sheet20',
    label: 'Kaart van Suriname Sheet 20',
    annotationUrl: 'https://annotations.allmaps.org/maps/22175ded421abf79',
    defaultEnabled: false,
    transformation: 'thinPlateSpline',
    gcpCount: 5,
  },
  {
    id: 'leiden-overview',
    label: 'Leiden Overview Map',
    annotationUrl: 'https://annotations.allmaps.org/maps/d76dd411d74219c1',
    defaultEnabled: false,
    transformation: 'thinPlateSpline',
    gcpCount: '40+',
  },
];

const DEFAULT_ENABLED = new Set(
  OVERLAY_CONFIGS.filter((c) => c.defaultEnabled).map((c) => c.id),
);

// Monkey-patch L.DomUtil.getPosition so that _leaflet_pos is never
// undefined.  Allmaps' WebGL renderer continuously reads _leaflet_pos
// from map pane elements; if a pane hasn't been positioned yet the
// read throws a TypeError.  By intercepting the read we guarantee a
// safe fallback of Point(0,0).
const _origGetPosition = L.DomUtil.getPosition;
L.DomUtil.getPosition = function (el: HTMLElement): L.Point {
  if (!el) return new L.Point(0, 0);
  if (!(el as unknown as Record<string, unknown>)._leaflet_pos) {
    (el as unknown as Record<string, unknown>)._leaflet_pos = new L.Point(0, 0);
  }
  return _origGetPosition.call(this, el);
};

interface MapViewProps {
  geojson: GeoJSONCollection | null;
  selectedPlantationUri: string | null;
  highlightedName: string | null;
  panelOpen: boolean;
  onSelectPlantation: (feature: GeoJSONFeature) => void;
  onHighlightName: (name: string) => void;
  initialCenter?: [number, number];
  initialZoom?: number;
  onViewportChange?: (center: [number, number], zoom: number) => void;
}

export default function MapView({
  geojson,
  selectedPlantationUri,
  highlightedName,
  panelOpen,
  onSelectPlantation,
  onHighlightName,
  initialCenter,
  initialZoom,
  onViewportChange,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const warpedLayersRef = useRef<Map<string, L.Layer[]>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedUriRef = useRef(selectedPlantationUri);
  const highlightedNameRef = useRef(highlightedName);
  const onSelectRef = useRef(onSelectPlantation);
  const {
    colors: PLACE_TYPE_COLORS,
    labels: PLACE_TYPE_LABELS,
    allTypes,
  } = usePlaceTypes();
  const placeTypeColorsRef = useRef(PLACE_TYPE_COLORS);
  placeTypeColorsRef.current = PLACE_TYPE_COLORS;
  const placeTypeLabelsRef = useRef(PLACE_TYPE_LABELS);
  placeTypeLabelsRef.current = PLACE_TYPE_LABELS;
  const [opacity, setOpacity] = useState(0.7);
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;
  const [enabledOverlays, setEnabledOverlays] = useState<Set<string>>(
    () => new Set(DEFAULT_ENABLED),
  );
  const [layersOpen, setLayersOpen] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const layersDropdownRef = useRef<HTMLDivElement>(null);
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(
    () => new Set(allTypes),
  );
  const enabledFeaturesRef = useRef(enabledFeatures);
  enabledFeaturesRef.current = enabledFeatures;
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const featuresDropdownRef = useRef<HTMLDivElement>(null);

  // Keep callback ref in sync
  useEffect(() => {
    onSelectRef.current = onSelectPlantation;
  });

  // Initialize map
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: initialCenter ?? [5.5, -55.2],
      zoom: initialZoom ?? 8,
      zoomControl: false,
      zoomAnimation: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      // Remove all warped layers
      warpedLayersRef.current.forEach((layers) => {
        layers.forEach((l) => l.remove());
      });
      warpedLayersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Notify parent of viewport changes (debounced to avoid flooding)
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let timer: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const c = map.getCenter();
        onViewportChangeRef.current?.([c.lat, c.lng], map.getZoom());
      }, 1500);
    };
    map.on('moveend', handler);
    return () => {
      clearTimeout(timer);
      map.off('moveend', handler);
    };
  }, []);

  // Toggle overlay callback — creates/destroys WarpedMapLayer lazily
  const toggleOverlay = useCallback((id: string, config: OverlayConfig) => {
    setEnabledOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Remove existing layers
        const layers = warpedLayersRef.current.get(id);
        if (layers) {
          layers.forEach((l) => l.remove());
          warpedLayersRef.current.delete(id);
        }
        next.delete(id);
      } else {
        // Create new layers lazily
        next.add(id);
        const map = mapRef.current;
        if (map) {
          import('@allmaps/leaflet')
            .then(async ({ WarpedMapLayer }) => {
              if (!mapRef.current || !next.has(id)) return;
              // Create a single WarpedMapLayer and add all annotations to it
              // (matches reference site pattern: one layer, multiple sheets)
              const urls =
                config.annotationUrls ??
                (config.annotationUrl ? [config.annotationUrl] : []);
              if (urls.length === 0) return;
              const warpedMapLayer = new WarpedMapLayer(urls[0]);
              warpedMapLayer.addTo(map);
              for (const url of urls.slice(1)) {
                await (
                  warpedMapLayer as unknown as {
                    addGeoreferenceAnnotationByUrl: (
                      u: string,
                    ) => Promise<unknown>;
                  }
                ).addGeoreferenceAnnotationByUrl(url);
              }
              if ('setOpacity' in warpedMapLayer) {
                (
                  warpedMapLayer as unknown as {
                    setOpacity: (o: number) => void;
                  }
                ).setOpacity(opacityRef.current);
              }
              warpedLayersRef.current.set(id, [warpedMapLayer]);
            })
            .catch(() => {
              // Allmaps module failed to load
            });
        }
      }
      return next;
    });
  }, []);

  // Initialize default-enabled overlays once map is ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.whenReady(() => {
      OVERLAY_CONFIGS.forEach((config) => {
        if (config.defaultEnabled && !warpedLayersRef.current.has(config.id)) {
          import('@allmaps/leaflet')
            .then(async ({ WarpedMapLayer }) => {
              if (!mapRef.current) return;
              const urls =
                config.annotationUrls ??
                (config.annotationUrl ? [config.annotationUrl] : []);
              if (urls.length === 0) return;
              const warpedMapLayer = new WarpedMapLayer(urls[0]);
              warpedMapLayer.addTo(map);
              for (const url of urls.slice(1)) {
                await (
                  warpedMapLayer as unknown as {
                    addGeoreferenceAnnotationByUrl: (
                      u: string,
                    ) => Promise<unknown>;
                  }
                ).addGeoreferenceAnnotationByUrl(url);
              }
              if ('setOpacity' in warpedMapLayer) {
                (
                  warpedMapLayer as unknown as {
                    setOpacity: (o: number) => void;
                  }
                ).setOpacity(opacityRef.current);
              }
              warpedLayersRef.current.set(config.id, [warpedMapLayer]);
            })
            .catch(() => {
              // Allmaps module failed to load — map still usable
            });
        }
      });
    });
  }, []);

  // Add/update GeoJSON layer — recreate only when data changes
  useEffect(() => {
    if (!mapRef.current || !geojson) return;

    if (layerRef.current) {
      layerRef.current.remove();
    }

    const layer = L.geoJSON(geojson as unknown as GeoJSON.GeoJsonObject, {
      filter: (feature) => {
        const ft = feature?.properties?.featureType;
        return !ft || enabledFeaturesRef.current.has(ft);
      },
      pointToLayer: (_feature, latlng) => {
        return L.circleMarker(latlng, { radius: 6 });
      },
      style: (feature) => {
        const props = feature?.properties;
        const geomType = feature?.geometry?.type;
        const ft = props?.featureType || 'plantation';
        const featureIdentifier =
          props?.plantationUri ?? props?.featureUri ?? props?.placeUri;
        const isSelected = featureIdentifier === selectedUriRef.current;
        const isHighlighted =
          !isSelected &&
          !!highlightedNameRef.current &&
          props?.name
            ?.toLowerCase()
            .includes(highlightedNameRef.current.toLowerCase());

        // Point features (settlements, military posts, stations, villages, towns)
        if (geomType === 'Point') {
          const color = placeTypeColorsRef.current[ft] || '#888';
          if (isSelected) {
            return {
              fillColor: color,
              fillOpacity: 0.9,
              color: '#333',
              weight: 2.5,
            };
          }
          if (isHighlighted) {
            return {
              fillColor: '#e07850',
              fillOpacity: 0.8,
              color: '#a04020',
              weight: 2,
            };
          }
          return {
            fillColor: color,
            fillOpacity: 0.7,
            color: '#fff',
            weight: 1.5,
          };
        }

        // LineString features
        if (geomType === 'LineString') {
          // Roads
          if (ft === 'road') {
            if (isSelected)
              return { color: '#8B4513', weight: 3, opacity: 0.9 };
            if (isHighlighted)
              return {
                color: '#e07850',
                weight: 2.5,
                opacity: 0.8,
                dashArray: '6 3',
              };
            return {
              color: '#a0522d',
              weight: 2,
              opacity: 0.6,
              dashArray: '5 4',
            };
          }
          // Railroad
          if (ft === 'railroad') {
            if (isSelected)
              return { color: '#1a1a1a', weight: 4, opacity: 0.9 };
            if (isHighlighted)
              return {
                color: '#e07850',
                weight: 3.5,
                opacity: 0.8,
                dashArray: '6 3',
              };
            return {
              color: '#2c2c2c',
              weight: 3,
              opacity: 0.7,
              dashArray: '8 4 2 4',
            };
          }
          // Rivers and creeks
          const isCreek = ft === 'creek';
          if (isSelected) {
            return {
              color: '#1a6fa0',
              weight: isCreek ? 3 : 4,
              opacity: 0.9,
            };
          }
          if (isHighlighted) {
            return {
              color: '#e07850',
              weight: isCreek ? 2.5 : 3.5,
              opacity: 0.8,
              dashArray: '6 3',
            };
          }
          return {
            color: isCreek ? '#6baed6' : '#3182bd',
            weight: isCreek ? 1.5 : 2.5,
            opacity: 0.7,
          };
        }

        // Polygon features (plantations)
        const isBuilt = props?.status === 'built';
        if (isSelected) {
          return {
            fillColor: '#c0944e',
            fillOpacity: 0.55,
            color: '#8c6228',
            weight: 3,
          };
        }
        if (isHighlighted) {
          return {
            fillColor: '#e07850',
            fillOpacity: 0.45,
            color: '#a04020',
            weight: 2,
            dashArray: '6 3',
          };
        }
        return {
          fillColor: isBuilt ? '#a67830' : '#a39b8e',
          fillOpacity: 0.25,
          color: isBuilt ? '#6e4d20' : '#6e6658',
          weight: 1,
        };
      },
      onEachFeature: (feature, featureLayer) => {
        const props = feature.properties;
        const ft = props?.featureType || 'plantation';
        const label = placeTypeLabelsRef.current[ft];
        const tooltip = `${props.name || 'Unknown'}${label ? ` (${label})` : ''}`;
        featureLayer.bindTooltip(tooltip, {
          sticky: true,
          className: 'plantation-tooltip',
        });

        featureLayer.on('click', () => {
          onSelectRef.current(feature as unknown as GeoJSONFeature);
        });

        const featureIdentifier =
          props?.plantationUri ?? props?.featureUri ?? props?.placeUri;
        featureLayer.on('mouseover', (e) => {
          const target = e.target as L.Path;
          if (featureIdentifier !== selectedUriRef.current) {
            if (feature.geometry?.type === 'Point') {
              target.setStyle({ fillOpacity: 0.9, weight: 2.5 });
            } else if (feature.geometry?.type === 'LineString') {
              target.setStyle({ opacity: 0.9, weight: 3.5 });
            } else {
              target.setStyle({ fillOpacity: 0.5, weight: 2 });
            }
          }
        });

        featureLayer.on('mouseout', (e) => {
          const target = e.target as L.Path;
          if (featureIdentifier !== selectedUriRef.current) {
            layer.resetStyle(target);
          }
        });
      },
    });

    layer.addTo(mapRef.current);
    layerRef.current = layer;
  }, [geojson, enabledFeatures]);

  // Restyle features when selection or highlight changes (no layer recreation)
  useEffect(() => {
    selectedUriRef.current = selectedPlantationUri;
    highlightedNameRef.current = highlightedName;
    if (layerRef.current) {
      layerRef.current.eachLayer((l) => {
        layerRef.current!.resetStyle(l as L.Path);
      });
    }
  }, [selectedPlantationUri, highlightedName]);

  // Sync overlay opacity across all active layers
  useEffect(() => {
    warpedLayersRef.current.forEach((layers, id) => {
      const visible = enabledOverlays.has(id);
      for (const layer of layers) {
        if ('setOpacity' in layer) {
          (layer as unknown as { setOpacity: (o: number) => void }).setOpacity(
            visible ? opacity : 0,
          );
        }
      }
    });
  }, [opacity, enabledOverlays]);

  // Fly to selected feature — pad right side when panel is open
  useEffect(() => {
    if (!mapRef.current || !layerRef.current || !selectedPlantationUri) return;

    layerRef.current.eachLayer((layer) => {
      const feature = (layer as unknown as { feature?: GeoJSONFeature })
        .feature;
      const featureIdentifier =
        feature?.properties?.plantationUri ??
        feature?.properties?.featureUri ??
        feature?.properties?.placeUri;
      if (featureIdentifier === selectedPlantationUri) {
        const geomType = feature?.geometry?.type;
        if (geomType === 'Point') {
          const latlng = (layer as L.CircleMarker).getLatLng();
          mapRef.current!.flyTo(latlng, 13);
        } else {
          const bounds = (layer as L.Polygon).getBounds();
          mapRef.current!.flyToBounds(bounds, {
            padding: [50, 50],
            paddingBottomRight: panelOpen ? [420, 50] : [50, 50],
            maxZoom: 13,
          });
        }
      }
    });
  }, [selectedPlantationUri, panelOpen]);

  // Fly to all highlighted features when name is highlighted without selection
  useEffect(() => {
    if (
      !mapRef.current ||
      !layerRef.current ||
      !highlightedName ||
      selectedPlantationUri
    )
      return;

    let combinedBounds: L.LatLngBounds | null = null;
    layerRef.current.eachLayer((layer) => {
      const feature = (layer as unknown as { feature?: GeoJSONFeature })
        .feature;
      if (
        feature?.properties?.name
          ?.toLowerCase()
          .includes(highlightedName.toLowerCase())
      ) {
        let bounds: L.LatLngBounds;
        const geomType = feature.geometry?.type;
        if (geomType === 'Point') {
          const latlng = (layer as L.CircleMarker).getLatLng();
          bounds = L.latLngBounds(latlng, latlng);
        } else {
          bounds = (layer as L.Polygon).getBounds();
        }
        combinedBounds = combinedBounds
          ? combinedBounds.extend(bounds)
          : bounds;
      }
    });
    if (combinedBounds) {
      mapRef.current.flyToBounds(combinedBounds, {
        padding: [50, 50],
        maxZoom: 13,
      });
    }
  }, [highlightedName, selectedPlantationUri]);

  function handleZoomIn() {
    mapRef.current?.zoomIn();
  }
  function handleZoomOut() {
    mapRef.current?.zoomOut();
  }

  // Close layers dropdown on click outside
  useEffect(() => {
    if (!layersOpen && !featuresOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        layersOpen &&
        layersDropdownRef.current &&
        !layersDropdownRef.current.contains(e.target as Node)
      ) {
        setLayersOpen(false);
      }
      if (
        featuresOpen &&
        featuresDropdownRef.current &&
        !featuresDropdownRef.current.contains(e.target as Node)
      ) {
        setFeaturesOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [layersOpen, featuresOpen]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Unified top toolbar */}
      <div className="absolute top-3 left-3 right-3 z-1000 flex items-start gap-2">
        {/* Toolbar toggle (collapsed state) */}
        {!toolbarOpen && (
          <button
            onClick={() => setToolbarOpen(true)}
            className="bg-white/95 backdrop-blur-sm shadow-md p-2 border border-stm-warm-200 hover:bg-stm-warm-50 transition-colors"
            aria-label="Open map toolbar"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4 6h12M4 10h12M4 14h12" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/* Toolbar panel */}
        {toolbarOpen && (
          <div className="bg-white/95 backdrop-blur-sm shadow-md border border-stm-warm-200 flex items-center gap-3 px-3 py-2 flex-wrap">
            {/* Zoom controls */}
            <div className="flex items-center">
              <button
                onClick={handleZoomIn}
                className="w-7 h-7 flex items-center justify-center text-stm-warm-700 hover:bg-stm-warm-100 transition-colors border-r border-stm-warm-200"
                aria-label="Zoom in"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M7 2v10M2 7h10" strokeLinecap="round" />
                </svg>
              </button>
              <button
                onClick={handleZoomOut}
                className="w-7 h-7 flex items-center justify-center text-stm-warm-700 hover:bg-stm-warm-100 transition-colors"
                aria-label="Zoom out"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M2 7h10" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-stm-warm-200" />

            {/* Search */}
            <SearchInput
              geojson={geojson}
              onSelect={onSelectPlantation}
              onHighlightName={onHighlightName}
            />

            {/* Divider */}
            <div className="w-px h-6 bg-stm-warm-200" />

            {/* Legend (compact) */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-2.5 border-2 border-stm-sepia-600 bg-stm-sepia-300 opacity-80 inline-block" />
                <span className="text-stm-warm-600">Selected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-2.5 border border-dashed border-[#a04020] bg-[#e07850] opacity-70 inline-block" />
                <span className="text-stm-warm-600">Highlighted</span>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-stm-warm-200" />

            {/* Feature layers dropdown */}
            <div className="relative" ref={featuresDropdownRef}>
              <button
                onClick={() => setFeaturesOpen((v) => !v)}
                className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 transition-colors ${
                  featuresOpen
                    ? 'bg-stm-sepia-100 text-stm-sepia-800'
                    : 'text-stm-warm-700 hover:bg-stm-warm-100'
                }`}
                aria-label="Toggle feature layers"
                aria-expanded={featuresOpen}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="7" cy="7" r="3" />
                  <path
                    d="M1 7h2.5M10.5 7H13M7 1v2.5M7 10.5V13"
                    strokeLinecap="round"
                  />
                </svg>
                Features
                <span className="ml-0.5 bg-stm-sepia-600 text-white text-[10px] leading-none px-1 py-0.5 rounded-full">
                  {enabledFeatures.size}
                </span>
              </button>

              {featuresOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-stm-warm-200 shadow-lg z-10">
                  <div className="px-3 py-1.5 border-b border-stm-warm-100 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-stm-warm-500 uppercase tracking-wide">
                      Feature Layers
                    </span>
                    <button
                      onClick={() => {
                        setEnabledFeatures((prev) =>
                          prev.size === allTypes.length
                            ? new Set<string>()
                            : new Set(allTypes),
                        );
                      }}
                      className="text-[10px] text-stm-sepia-600 hover:text-stm-sepia-800"
                    >
                      {enabledFeatures.size === allTypes.length
                        ? 'None'
                        : 'All'}
                    </button>
                  </div>
                  <ul className="max-h-72 overflow-y-auto py-1">
                    {allTypes.map((ft) => {
                      const isOn = enabledFeatures.has(ft);
                      const color = PLACE_TYPE_COLORS[ft];
                      const label = PLACE_TYPE_LABELS[ft] || ft;
                      const isLine =
                        ft === 'river' ||
                        ft === 'creek' ||
                        ft === 'road' ||
                        ft === 'railroad';
                      const isPoly = ft === 'plantation';
                      return (
                        <li key={ft}>
                          <label className="flex items-center gap-2 px-3 py-1 hover:bg-stm-warm-50 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => {
                                setEnabledFeatures((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(ft)) next.delete(ft);
                                  else next.add(ft);
                                  return next;
                                });
                              }}
                              className="accent-stm-sepia-600"
                            />
                            {isPoly ? (
                              <span
                                className="w-3.5 h-2.5 inline-block opacity-60"
                                style={{ backgroundColor: color }}
                              />
                            ) : isLine ? (
                              <span
                                className="w-3.5 h-0.5 inline-block"
                                style={{ backgroundColor: color }}
                              />
                            ) : (
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: color, opacity: 0.7 }}
                              />
                            )}
                            <span className="text-stm-warm-800 flex-1">
                              {label}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            {/* Divider */}
            <div className="w-px h-6 bg-stm-warm-200" />

            {/* Overlay layers dropdown */}
            <div className="relative" ref={layersDropdownRef}>
              <button
                onClick={() => setLayersOpen((v) => !v)}
                className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 transition-colors ${
                  layersOpen
                    ? 'bg-stm-sepia-100 text-stm-sepia-800'
                    : 'text-stm-warm-700 hover:bg-stm-warm-100'
                }`}
                aria-label="Toggle map layers panel"
                aria-expanded={layersOpen}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    d="M7 2L1 5l6 3 6-3-6-3zM1 9l6 3 6-3M1 7l6 3 6-3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Layers
                {enabledOverlays.size > 0 && (
                  <span className="ml-0.5 bg-stm-sepia-600 text-white text-[10px] leading-none px-1 py-0.5 rounded-full">
                    {enabledOverlays.size}
                  </span>
                )}
              </button>

              {layersOpen && (
                <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-stm-warm-200 shadow-lg z-10">
                  {/* Shared opacity slider */}
                  <div className="px-3 py-2 border-b border-stm-warm-100 flex items-center gap-2">
                    <span className="text-xs text-stm-warm-600 whitespace-nowrap">
                      Opacity
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={opacity}
                      onChange={(e) => setOpacity(parseFloat(e.target.value))}
                      className="flex-1 accent-stm-sepia-600"
                      aria-label="Map overlay opacity"
                    />
                    <span className="text-[10px] text-stm-warm-400 w-7 text-right">
                      {Math.round(opacity * 100)}%
                    </span>
                  </div>

                  {/* Map checkboxes with info */}
                  <ul className="max-h-80 overflow-y-auto py-1">
                    {OVERLAY_CONFIGS.map((config) => {
                      const isEnabled = enabledOverlays.has(config.id);
                      return (
                        <li key={config.id}>
                          <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-stm-warm-50 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => toggleOverlay(config.id, config)}
                              className="accent-stm-sepia-600"
                            />
                            <span className="text-stm-warm-800 truncate flex-1">
                              {config.label}
                            </span>
                          </label>
                          {isEnabled && (
                            <div className="flex items-center gap-2 px-3 pb-1 pl-8 text-[10px] text-stm-warm-400">
                              <span title="Transformation type">
                                {TRANSFORMATION_LABELS[config.transformation] ??
                                  config.transformation}
                              </span>
                              <span>·</span>
                              <span title="Ground control points">
                                {config.gcpCount} GCPs
                              </span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* Collapse button */}
            <button
              onClick={() => setToolbarOpen(false)}
              className="ml-auto text-stm-warm-400 hover:text-stm-warm-600 transition-colors p-0.5"
              aria-label="Collapse toolbar"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* Inline search input */
function SearchInput({
  geojson,
  onSelect,
  onHighlightName,
}: {
  geojson: GeoJSONCollection | null;
  onSelect: (feature: GeoJSONFeature) => void;
  onHighlightName: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = (() => {
    if (!geojson || query.length < 2) return [];
    const q = query.toLowerCase();
    return geojson.features
      .filter((f) => f.properties.name?.toLowerCase().includes(q))
      .slice(0, 20);
  })();

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search features..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && query.length >= 2) {
            onHighlightName(query);
            setOpen(false);
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        aria-label="Search features by name"
        aria-autocomplete="list"
        role="combobox"
        aria-expanded={open && results.length > 0}
        className="w-48 px-2.5 py-1 border border-stm-warm-300 bg-white text-sm text-stm-warm-900 placeholder:text-stm-warm-400 focus:outline-none focus:ring-2 focus:ring-stm-sepia-400"
      />
      {open && results.length > 0 && (
        <ul
          className="absolute top-full left-0 mt-1 w-64 bg-white border border-stm-warm-200 shadow-lg max-h-64 overflow-y-auto z-10"
          role="listbox"
        >
          {results.map((f) => (
            <li key={f.id} role="option">
              <button
                className="w-full text-left px-3 py-2 text-sm text-stm-warm-800 hover:bg-stm-sepia-50 transition-colors"
                onMouseDown={() => {
                  onSelect(f);
                  setQuery(f.properties.name);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{f.properties.name}</span>
                {f.properties.organizationQid && (
                  <span className="ml-2 text-xs text-stm-warm-400">
                    {f.properties.organizationQid}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
