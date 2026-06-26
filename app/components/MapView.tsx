'use client';

import 'leaflet/dist/leaflet.css';
import { loadAllmapsAnnotation } from '@/lib/allmaps';
import { HISTORIC_MAPS } from '@/lib/historic-maps';
import { usePlaceTypes } from '@/lib/thesaurus';
import type { GeoJSONCollection, GeoJSONFeature } from '@/lib/types';
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
  ...HISTORIC_MAPS.map((map) => ({ ...map, defaultEnabled: false })),
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
    id: 'historic-map-32-main',
    label: 'Paramaribo main map 1916-17',
    annotationUrl: 'https://annotations.allmaps.org/maps/a8b80690c8e2e4cb',
    defaultEnabled: false,
    transformation: 'polynominal',
    gcpCount: '28',
  },
  {
    id: 'historic-map-32-districts',
    label: 'Paramaribo districts 1916',
    annotationUrl: 'https://annotations.allmaps.org/maps/5f85ef4e29065511',
    defaultEnabled: false,
    transformation: 'thinPlateSpline',
    gcpCount: '13',
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
const ENABLE_WARPED_OVERLAYS = true;
const MAP_DESIGN = {
  cream: '#fdf8f2',
  tealStrong: '#006d5b',
  tealBright: '#34d1b3',
  mutedPlace: '#94cc7d',
};

function featureColor(
  featureType: string | undefined,
  colors: Record<string, string>,
) {
  return colors[featureType || ''] || MAP_DESIGN.mutedPlace;
}

function lineDash(featureType: string | undefined) {
  if (featureType === 'road') return '5 4';
  if (featureType === 'railroad') return '8 4 2 4';
  return undefined;
}

function lineWeight(featureType: string | undefined) {
  if (featureType === 'river') return 2.6;
  if (featureType === 'creek') return 1.8;
  if (featureType === 'railroad') return 3;
  if (featureType === 'road') return 2.2;
  return 2;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function safelyRemove(target: { remove: () => unknown } | null) {
  if (!target) return;
  try {
    target.remove();
  } catch (error) {
    // Allmaps uses AbortController for annotation fetches. Removing a warped
    // layer or map aborts those requests as part of normal cleanup.
    if (error instanceof Error && error.name === 'AbortError') return;
    console.error('Unable to remove a map layer.', error);
  }
}

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
  const [overlayErrors, setOverlayErrors] = useState<Record<string, string>>({});
  const enabledOverlaysRef = useRef(enabledOverlays);
  enabledOverlaysRef.current = enabledOverlays;
  const [layersOpen, setLayersOpen] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const layersDropdownRef = useRef<HTMLDivElement>(null);
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(
    () => new Set(allTypes),
  );
  const enabledFeaturesRef = useRef(enabledFeatures);
  enabledFeaturesRef.current = enabledFeatures;
  const knownFeatureTypesRef = useRef<Set<string>>(new Set(allTypes));
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const featuresDropdownRef = useRef<HTMLDivElement>(null);

  // The thesaurus loads after the map mounts. Enable newly published place
  // types by default without re-enabling types a visitor has turned off.
  useEffect(() => {
    const known = knownFeatureTypesRef.current;
    const newTypes = allTypes.filter((type) => !known.has(type));
    if (newTypes.length === 0) return;
    knownFeatureTypesRef.current = new Set([...known, ...newTypes]);
    setEnabledFeatures((previous) => new Set([...previous, ...newTypes]));
  }, [allTypes]);

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

    // Leaflet and Allmaps both need one frame after mount to observe the
    // final container size before warped overlays start reading pane positions.
    requestAnimationFrame(() => {
      map.invalidateSize();
    });

    return () => {
      // Remove all warped layers
      warpedLayersRef.current.forEach((layers) => {
        layers.forEach(safelyRemove);
      });
      warpedLayersRef.current.clear();
      safelyRemove(map);
      mapRef.current = null;
    };
  }, []);

  // Notify parent of viewport changes (debounced to avoid flooding)
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const c = map.getCenter();
        onViewportChangeRef.current?.([c.lat, c.lng], map.getZoom());
      }, 1500);
    };
    map.on('moveend', handler);
    return () => {
      if (timer) clearTimeout(timer);
      map.off('moveend', handler);
    };
  }, []);

  const loadOverlay = useCallback((id: string, config: OverlayConfig) => {
    const map = mapRef.current;
    if (!map || warpedLayersRef.current.has(id)) return;
    const urls =
      config.annotationUrls ??
      (config.annotationUrl ? [config.annotationUrl] : []);
    if (urls.length === 0) return;

    Promise.all(urls.map(loadAllmapsAnnotation))
      .then(async (annotations) => {
        const { WarpedMapLayer } = await import('@allmaps/leaflet');
        if (mapRef.current !== map || !enabledOverlaysRef.current.has(id)) return;
        await nextFrame();
        if (mapRef.current !== map || !enabledOverlaysRef.current.has(id)) return;

        const warpedMapLayer = new WarpedMapLayer(annotations[0]);
        warpedMapLayer.addTo(map);
        warpedLayersRef.current.set(id, [warpedMapLayer]);
        for (const annotation of annotations.slice(1)) {
          if (mapRef.current !== map || !enabledOverlaysRef.current.has(id)) {
            safelyRemove(warpedMapLayer);
            warpedLayersRef.current.delete(id);
            return;
          }
          (
            warpedMapLayer as unknown as {
              addGeoreferenceAnnotation: (value: unknown) => unknown;
            }
          ).addGeoreferenceAnnotation(annotation);
        }
        if ('setOpacity' in warpedMapLayer) {
          (
            warpedMapLayer as unknown as {
              setOpacity: (o: number) => void;
            }
          ).setOpacity(opacityRef.current);
        }
      })
      .catch(() => {
        if (mapRef.current !== map) return;
        setOverlayErrors((previous) => ({
          ...previous,
          [id]: 'Image service unavailable',
        }));
        const disabled = new Set(enabledOverlaysRef.current);
        disabled.delete(id);
        enabledOverlaysRef.current = disabled;
        setEnabledOverlays(disabled);
      });
  }, []);

  // Toggle overlay callback — creates/destroys WarpedMapLayer lazily
  const toggleOverlay = useCallback((id: string, config: OverlayConfig) => {
    if (!ENABLE_WARPED_OVERLAYS) return;
    const next = new Set(enabledOverlaysRef.current);
    if (next.has(id)) {
      const layers = warpedLayersRef.current.get(id);
      if (layers) {
        layers.forEach(safelyRemove);
        warpedLayersRef.current.delete(id);
      }
      next.delete(id);
      enabledOverlaysRef.current = next;
      setEnabledOverlays(next);
      return;
    }

    next.add(id);
    enabledOverlaysRef.current = next;
    setEnabledOverlays(next);
    setOverlayErrors((previous) => {
      const { [id]: _removed, ...remaining } = previous;
      return remaining;
    });
    loadOverlay(id, config);
  }, [loadOverlay]);

  // Initialize default-enabled overlays once map is ready
  useEffect(() => {
    if (!ENABLE_WARPED_OVERLAYS) return;
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    map.whenReady(() => {
      OVERLAY_CONFIGS.forEach((config) => {
        if (config.defaultEnabled && !warpedLayersRef.current.has(config.id)) {
          const urls =
            config.annotationUrls ??
            (config.annotationUrl ? [config.annotationUrl] : []);
          Promise.all(urls.map(loadAllmapsAnnotation))
            .then(async (annotations) => {
              const { WarpedMapLayer } = await import('@allmaps/leaflet');
              if (cancelled || mapRef.current !== map) return;
              await nextFrame();
              if (cancelled || mapRef.current !== map) return;
              if (urls.length === 0) return;
              const warpedMapLayer = new WarpedMapLayer(annotations[0]);
              warpedMapLayer.addTo(map);
              warpedLayersRef.current.set(config.id, [warpedMapLayer]);
              for (const annotation of annotations.slice(1)) {
                if (cancelled || mapRef.current !== map) {
                  safelyRemove(warpedMapLayer);
                  warpedLayersRef.current.delete(config.id);
                  return;
                }
                (
                  warpedMapLayer as unknown as {
                    addGeoreferenceAnnotation: (value: unknown) => unknown;
                  }
                ).addGeoreferenceAnnotation(annotation);
              }
              if ('setOpacity' in warpedMapLayer) {
                (
                  warpedMapLayer as unknown as {
                    setOpacity: (o: number) => void;
                  }
                ).setOpacity(opacityRef.current);
              }
            })
            .catch(() => {
              // Allmaps module failed to load — map still usable
            });
        }
      });
    });

    return () => {
      cancelled = true;
    };
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
      pointToLayer: (feature, latlng) => {
        const isHistoricalAddress =
          feature.properties?.featureType === 'historical-address';
        return L.circleMarker(latlng, {
          radius: isHistoricalAddress ? 3.25 : 5.5,
        });
      },
      style: (feature) => {
        const props = feature?.properties;
        const geomType = feature?.geometry?.type;
        const ft = props?.featureType || 'plantation';
        const color = featureColor(ft, placeTypeColorsRef.current);
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
          if (isSelected) {
            return {
              fillColor: color,
              fillOpacity: 0.95,
              color: MAP_DESIGN.tealStrong,
              opacity: 1,
              weight: 3,
            };
          }
          if (isHighlighted) {
            return {
              fillColor: color,
              fillOpacity: 0.9,
              color: MAP_DESIGN.tealBright,
              opacity: 1,
              weight: 2.5,
            };
          }
          return {
            fillColor: color,
            fillOpacity: 0.74,
            color: MAP_DESIGN.cream,
            opacity: 1,
            weight: 1.4,
          };
        }

        // LineString / MultiLineString features
        if (geomType === 'LineString' || geomType === 'MultiLineString') {
          const baseWeight = lineWeight(ft);
          const dash = isHighlighted ? '6 3' : lineDash(ft);
          if (isSelected) {
            return {
              color,
              weight: baseWeight + 1.4,
              opacity: 0.95,
              dashArray: dash,
            };
          }
          if (isHighlighted) {
            return {
              color: MAP_DESIGN.tealBright,
              weight: baseWeight + 1,
              opacity: 0.92,
              dashArray: dash,
            };
          }
          return {
            color,
            weight: baseWeight,
            opacity: 0.72,
            dashArray: dash,
          };
        }

        // Polygon features (plantations)
        const isBuilt = props?.status === 'built';
        if (isSelected) {
          return {
            fillColor: color,
            fillOpacity: 0.48,
            color: MAP_DESIGN.tealStrong,
            weight: 3,
          };
        }
        if (isHighlighted) {
          return {
            fillColor: color,
            fillOpacity: 0.42,
            color: MAP_DESIGN.tealBright,
            weight: 2,
            dashArray: '6 3',
          };
        }
        return {
          fillColor: color,
          fillOpacity: isBuilt ? 0.24 : 0.14,
          color,
          opacity: isBuilt ? 0.68 : 0.45,
          weight: isBuilt ? 1.2 : 1,
          dashArray: isBuilt ? undefined : '4 3',
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
              target.setStyle({
                color: MAP_DESIGN.tealBright,
                fillOpacity: 0.9,
                weight: 2.5,
              });
            } else if (
              feature.geometry?.type === 'LineString' ||
              feature.geometry?.type === 'MultiLineString'
            ) {
              target.setStyle({
                color: MAP_DESIGN.tealBright,
                opacity: 0.9,
                weight: lineWeight(ft) + 1,
              });
            } else {
              target.setStyle({
                color: MAP_DESIGN.tealBright,
                fillOpacity: 0.44,
                weight: 2,
              });
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
            className="site-panel p-2 text-ink/75 hover:text-teal-strong transition-colors"
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
          <div className="site-panel flex items-center gap-3 px-3 py-2 flex-wrap backdrop-blur-sm">
            {/* Zoom controls */}
            <div className="flex items-center">
              <button
                onClick={handleZoomIn}
                className="w-7 h-7 flex items-center justify-center text-ink/75 hover:bg-teal-soft/25 hover:text-teal-strong transition-colors border-r border-ink/10"
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
                className="w-7 h-7 flex items-center justify-center text-ink/75 hover:bg-teal-soft/25 hover:text-teal-strong transition-colors"
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
            <div className="w-px h-6 bg-ink/10" />

            {/* Search */}
            <SearchInput
              geojson={geojson}
              onSelect={onSelectPlantation}
              onHighlightName={onHighlightName}
            />

            {/* Divider */}
            <div className="w-px h-6 bg-ink/10" />

            {/* Legend (compact) */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-2.5 border-2 border-teal-strong bg-teal-soft/80 inline-block" />
                <span className="text-ink/65">Selected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-2.5 border border-dashed border-teal-bright bg-teal-soft/60 inline-block" />
                <span className="text-ink/65">Highlighted</span>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-ink/10" />

            {/* Feature layers dropdown */}
            <div className="relative" ref={featuresDropdownRef}>
              <button
                onClick={() => setFeaturesOpen((v) => !v)}
                className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 transition-colors ${
                  featuresOpen
                    ? 'bg-teal-soft/35 text-ink'
                    : 'text-ink/75 hover:bg-teal-soft/25 hover:text-teal-strong'
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
                <div className="site-panel absolute top-full left-0 mt-1 w-56 z-10">
                  <div className="px-3 py-1.5 border-b border-ink/10 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-ink/55 uppercase tracking-wide">
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
                          <label className="flex items-center gap-2 px-3 py-1 hover:bg-teal-soft/20 cursor-pointer text-xs">
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
                                className="w-3.5 h-2.5 inline-block border opacity-70"
                                style={{
                                  backgroundColor: color,
                                  borderColor: color,
                                }}
                              />
                            ) : isLine ? (
                              <span
                                className="w-3.5 h-0.5 inline-block"
                                style={{
                                  backgroundColor: color,
                                  opacity: 0.75,
                                }}
                              />
                            ) : (
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block border border-cream"
                                style={{
                                  backgroundColor: color,
                                  opacity: 0.8,
                                }}
                              />
                            )}
                            <span className="text-ink/80 flex-1">
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
            {ENABLE_WARPED_OVERLAYS && (
              <>
                {/* Divider */}
                <div className="w-px h-6 bg-ink/10" />

                {/* Overlay layers dropdown */}
                <div className="relative" ref={layersDropdownRef}>
                  <button
                    onClick={() => setLayersOpen((v) => !v)}
                    className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 transition-colors ${
                      layersOpen
                        ? 'bg-teal-soft/35 text-ink'
                        : 'text-ink/75 hover:bg-teal-soft/25 hover:text-teal-strong'
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
                    <div className="site-panel absolute top-full left-0 mt-1 w-80 z-10">
                      {/* Shared opacity slider */}
                      <div className="px-3 py-2 border-b border-ink/10 flex items-center gap-2">
                        <span className="text-xs text-ink/65 whitespace-nowrap">
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
                          const error = overlayErrors[config.id];
                          return (
                            <li key={config.id}>
                              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-teal-soft/20 cursor-pointer text-xs">
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
                              {error && (
                                <p className="px-3 pb-1 pl-8 text-[10px] text-stm-warm-500">
                                  {error}
                                </p>
                              )}
                              {config.annotationUrl && (
                                <p className="px-3 pb-1 pl-8 text-[10px]">
                                  <a
                                    href={config.annotationUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-stm-sepia-600 underline hover:text-stm-sepia-800"
                                  >
                                    Allmaps source
                                  </a>
                                </p>
                              )}
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
              </>
            )}

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
        className="w-48 px-2.5 py-1 border border-ink/15 bg-cream/95 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-teal-bright/40"
      />
      {open && results.length > 0 && (
        <ul
          className="site-panel absolute top-full left-0 mt-1 w-64 max-h-64 overflow-y-auto z-10"
          role="listbox"
        >
          {results.map((f) => (
            <li key={f.id} role="option">
              <button
                className="w-full text-left px-3 py-2 text-sm text-ink/80 hover:bg-teal-soft/20 transition-colors"
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
