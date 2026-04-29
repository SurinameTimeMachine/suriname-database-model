'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';

// Same Allmaps pane-position guard as PlaceMiniMap
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
  'https://annotations.allmaps.org/maps/d9191cafde1831f0',
  'https://annotations.allmaps.org/maps/dc967c11ce9e86b3',
  'https://annotations.allmaps.org/maps/edaf1bbc8b86f0bf',
  'https://annotations.allmaps.org/maps/9eac27facff8687f',
  'https://annotations.allmaps.org/maps/5e0b6889ed3816d9',
  'https://annotations.allmaps.org/maps/aacef031cb456d2a',
  'https://annotations.allmaps.org/maps/4d07f0d3bf9fc347',
  'https://annotations.allmaps.org/maps/ddd8d3ca24e1916a',
];

// A = teal, B = sepia/brown
const COLORS = {
  a: { stroke: '#2a7abf', fill: '#4a88bf', label: '#1a5a9a' },
  b: { stroke: '#8a5018', fill: '#a67830', label: '#6a3800' },
};

interface PlaceLocation {
  lat: number | null;
  lng: number | null;
  wkt: string | null;
}

export interface PlaceMergeMapProps {
  locationA: PlaceLocation;
  locationB: PlaceLocation;
  nameA: string;
  nameB: string;
}

function parseWKTPolygon(wkt: string): [number, number][] {
  const match = wkt.match(/\(\((.+)\)\)/);
  if (!match) return [];
  return match[1].split(',').map((pair) => {
    const [lng, lat] = pair.trim().split(/\s+/).map(Number);
    return [lat, lng] as [number, number];
  });
}

function makeLabel(letter: string, colors: { stroke: string }) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:20px;height:20px;
      background:${colors.stroke};
      border:2px solid white;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      color:white;font-size:10px;font-weight:700;font-family:sans-serif;
      box-shadow:0 1px 3px rgba(0,0,0,.4);
    ">${letter}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export default function PlaceMergeMap({
  locationA,
  locationB,
  nameA,
  nameB,
}: PlaceMergeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);
  const warpedLayerRef = useRef<L.Layer | null>(null);
  const [show1930Map, setShow1930Map] = useState(false);

  // Init map once
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

  // Redraw both places whenever locations change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old layers
    for (const l of layersRef.current) map.removeLayer(l);
    layersRef.current = [];

    const bounds: L.LatLngBoundsExpression[] = [];

    const addPlace = (loc: PlaceLocation, name: string, side: 'a' | 'b') => {
      const colors = COLORS[side];

      if (loc.wkt) {
        const coords = parseWKTPolygon(loc.wkt);
        if (coords.length > 0) {
          const poly = L.polygon(coords, {
            color: colors.stroke,
            fillColor: colors.fill,
            fillOpacity: 0.25,
            weight: 2.5,
          })
            .bindTooltip(`${side.toUpperCase()}: ${name}`, {
              sticky: true,
              className: 'leaflet-tooltip-stm',
            })
            .addTo(map);
          layersRef.current.push(poly);
          bounds.push(poly.getBounds());
        }
      }

      if (loc.lat != null && loc.lng != null) {
        const marker = L.marker([loc.lat, loc.lng], {
          icon: makeLabel(side.toUpperCase(), colors),
        })
          .bindTooltip(`${side.toUpperCase()}: ${name}`, {
            className: 'leaflet-tooltip-stm',
          })
          .addTo(map);
        layersRef.current.push(marker);
        if (!loc.wkt) bounds.push([[loc.lat, loc.lng]]);
      }
    };

    addPlace(locationA, nameA, 'a');
    addPlace(locationB, nameB, 'b');

    if (bounds.length > 0) {
      const combined = L.latLngBounds(
        bounds.flatMap((b) =>
          b instanceof L.LatLngBounds
            ? [b.getSouthWest(), b.getNorthEast()]
            : (b as [number, number][]).map((c) => L.latLng(c[0], c[1])),
        ),
      );
      if (combined.isValid()) {
        map.fitBounds(combined, { padding: [24, 24] });
      }
    }
  }, [locationA, locationB, nameA, nameB]);

  // 1930 map overlay
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
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [show1930Map]);

  const toggle1930Map = useCallback(() => setShow1930Map((v) => !v), []);

  return (
    <div
      className="relative w-full border border-stm-warm-200"
      style={{ height: '280px' }}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Legend */}
      <div className="absolute top-2 left-2 z-1000 flex flex-col gap-1 pointer-events-none">
        <div className="flex items-center gap-1.5 bg-white/90 px-2 py-1 text-xs font-medium shadow-sm border border-stm-warm-100">
          <span
            className="inline-block w-3 h-3 border-2 border-white"
            style={{ background: COLORS.a.stroke, borderRadius: '50%' }}
          />
          A: {nameA}
        </div>
        <div className="flex items-center gap-1.5 bg-white/90 px-2 py-1 text-xs font-medium shadow-sm border border-stm-warm-100">
          <span
            className="inline-block w-3 h-3 border-2 border-white"
            style={{ background: COLORS.b.stroke, borderRadius: '50%' }}
          />
          B: {nameB}
        </div>
      </div>

      {/* 1930 map toggle */}
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
