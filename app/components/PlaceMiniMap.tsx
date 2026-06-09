'use client';

import 'leaflet/dist/leaflet.css';
import { usePlaceTypes } from '@/lib/thesaurus';
import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';

// Allmaps' WebGL renderer reads _leaflet_pos from pane elements before Leaflet
// sets it; guard against undefined to avoid a TypeError on first render.
let _domUtilPatched = false;
if (typeof window !== 'undefined' && !_domUtilPatched) {
  const _orig = L.DomUtil.getPosition;
  L.DomUtil.getPosition = function (el: HTMLElement): L.Point {
    if (!el) return new L.Point(0, 0);
    if (!(el as unknown as Record<string, unknown>)._leaflet_pos) {
      (el as unknown as Record<string, unknown>)._leaflet_pos = new L.Point(
        0,
        0,
      );
    }
    return _orig.call(this, el);
  };
  _domUtilPatched = true;
}

const MAP_1930_URLS = [
  'https://annotations.allmaps.org/maps/d9191cafde1831f0', // sheet 3
  'https://annotations.allmaps.org/maps/dc967c11ce9e86b3', // sheet 4
  'https://annotations.allmaps.org/maps/edaf1bbc8b86f0bf', // sheet 5
  'https://annotations.allmaps.org/maps/9eac27facff8687f', // sheet 6
  'https://annotations.allmaps.org/maps/5e0b6889ed3816d9', // sheet 7
  'https://annotations.allmaps.org/maps/aacef031cb456d2a', // sheet 8
  'https://annotations.allmaps.org/maps/4d07f0d3bf9fc347', // sheet 9
  'https://annotations.allmaps.org/maps/ddd8d3ca24e1916a', // sheet 11
];

interface PlaceMiniMapProps {
  lat: number | null;
  lng: number | null;
  wkt: string | null;
  featureType?: string | null;
  editable?: boolean;
  onLocationChange?: (lat: number, lng: number) => void;
}

/**
 * Small Leaflet map that shows a place's location.
 * If editable, clicking sets a new marker position.
 */
export default function PlaceMiniMap({
  lat,
  lng,
  wkt,
  featureType,
  editable = false,
  onLocationChange,
}: PlaceMiniMapProps) {
  const { colors: placeTypeColors } = usePlaceTypes();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const polygonRef = useRef<L.Polygon | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const warpedLayerRef = useRef<L.Layer | null>(null);
  const [show1930Map, setShow1930Map] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: true,
    }).setView([5.5, -55.2], 8);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      warpedLayerRef.current?.remove();
      warpedLayerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Load or unload the 1930 Plantation Map overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!show1930Map) {
      warpedLayerRef.current?.remove();
      warpedLayerRef.current = null;
      return;
    }

    let cancelled = false;
    import('@allmaps/leaflet')
      .then(async ({ WarpedMapLayer }) => {
        if (cancelled || !mapRef.current) return;
        const layer = new WarpedMapLayer(MAP_1930_URLS[0]);
        layer.addTo(mapRef.current);
        for (const url of MAP_1930_URLS.slice(1)) {
          if (cancelled) break;
          await (
            layer as unknown as {
              addGeoreferenceAnnotationByUrl: (u: string) => Promise<unknown>;
            }
          ).addGeoreferenceAnnotationByUrl(url);
        }
        if (!cancelled) warpedLayerRef.current = layer;
      })
      .catch(() => {
        // Allmaps failed to load — mini map still usable without overlay
      });

    return () => {
      cancelled = true;
    };
  }, [show1930Map]);

  const toggle1930Map = useCallback(() => setShow1930Map((v) => !v), []);

  // Update map content when props change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing layers
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    if (polygonRef.current) {
      map.removeLayer(polygonRef.current);
      polygonRef.current = null;
    }
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    // Draw geometry from WKT if available
    if (wkt) {
      const upper = wkt.trim().toUpperCase();
      const fallbackType =
        featureType ||
        (upper.startsWith('LINESTRING') || upper.startsWith('MULTILINESTRING')
          ? 'river'
          : 'plantation');
      const color = placeTypeColors[fallbackType] || '#94cc7d';
      if (
        upper.startsWith('LINESTRING') ||
        upper.startsWith('MULTILINESTRING')
      ) {
        const lines = parseWKTLineString(wkt);
        if (lines.length > 0) {
          const pl = L.polyline(lines, {
            color,
            weight: fallbackType === 'creek' ? 2 : 2.8,
            dashArray:
              fallbackType === 'road'
                ? '5 4'
                : fallbackType === 'railroad'
                  ? '8 4 2 4'
                  : undefined,
            opacity: 0.82,
          }).addTo(map);
          polylineRef.current = pl;
          map.fitBounds(pl.getBounds(), { padding: [20, 20] });
        }
      } else {
        const coords = parseWKTPolygon(wkt);
        if (coords.length > 0) {
          const poly = L.polygon(coords, {
            color,
            fillColor: color,
            fillOpacity: 0.26,
            opacity: 0.72,
            weight: 1.6,
          }).addTo(map);
          polygonRef.current = poly;
          map.fitBounds(poly.getBounds(), { padding: [20, 20] });
        }
      }
    }

    // Place marker at centroid
    if (lat != null && lng != null) {
      const color = placeTypeColors[featureType || ''] || '#94cc7d';
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'place-marker',
          html: `<div style="width:14px;height:14px;background:${color};border:2px solid #006d5b;border-radius:50%;box-shadow:0 0 0 2px rgba(253,248,242,.95),0 2px 8px rgba(0,60,52,.22);"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      }).addTo(map);
      markerRef.current = marker;

      if (!wkt) {
        map.setView([lat, lng], 12);
      }
    }

    // Click to place marker (editable mode)
    if (editable) {
      const handleClick = (e: L.LeafletMouseEvent) => {
        onLocationChange?.(
          Math.round(e.latlng.lat * 1e6) / 1e6,
          Math.round(e.latlng.lng * 1e6) / 1e6,
        );
      };
      map.on('click', handleClick);
      return () => {
        map.off('click', handleClick);
      };
    }
  }, [lat, lng, wkt, featureType, editable, onLocationChange, placeTypeColors]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-48 border border-stm-warm-200"
      style={{ minHeight: '192px' }}
    >
      <button
        type="button"
        onClick={toggle1930Map}
        title="Toggle 1930 plantation map"
        className={[
          'absolute bottom-2 right-2 z-1000 px-2 py-0.5 text-[11px] font-medium border leading-tight',
          show1930Map
            ? 'bg-stm-sepia-600 text-white border-stm-sepia-700'
            : 'bg-white/90 text-stm-warm-600 border-stm-warm-300 hover:bg-stm-warm-50',
        ].join(' ')}
      >
        1930
      </button>
    </div>
  );
}

/** Parse simple WKT Polygon into Leaflet LatLng array */
function parseWKTPolygon(wkt: string): [number, number][] {
  const match = wkt.match(/\(\((.+)\)\)/);
  if (!match) return [];
  return match[1].split(',').map((pair) => {
    const [lng, lat] = pair.trim().split(/\s+/).map(Number);
    return [lat, lng] as [number, number];
  });
}

/**
 * Parse WKT LineString or MultiLineString into Leaflet LatLng arrays.
 * Returns an array of coordinate rings (one ring per line segment).
 */
function parseWKTLineString(wkt: string): [number, number][][] {
  const upper = wkt.trim().toUpperCase();
  if (upper.startsWith('MULTILINESTRING')) {
    // MULTILINESTRING ((lon lat, lon lat), (lon lat, lon lat))
    const innerMatch = wkt.match(/\(([\s\S]+)\)\s*$/);
    if (!innerMatch) return [];
    return innerMatch[1].split(/\)\s*,\s*\(/).map((ring) => {
      const clean = ring.replace(/^\(|\)$/g, '').trim();
      return clean.split(',').map((pair) => {
        const [lng, lat] = pair.trim().split(/\s+/).map(Number);
        return [lat, lng] as [number, number];
      });
    });
  }
  if (upper.startsWith('LINESTRING')) {
    // LineString (lon lat, lon lat, ...)
    const innerMatch = wkt.match(/\((.+)\)/);
    if (!innerMatch) return [];
    return [
      innerMatch[1].split(',').map((pair) => {
        const [lng, lat] = pair.trim().split(/\s+/).map(Number);
        return [lat, lng] as [number, number];
      }),
    ];
  }
  return [];
}
