'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';

interface PlaceMiniMapProps {
  lat: number | null;
  lng: number | null;
  wkt: string | null;
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
  editable = false,
  onLocationChange,
}: PlaceMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const polygonRef = useRef<L.Polygon | null>(null);

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
      map.remove();
      mapRef.current = null;
    };
  }, []);

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

    // Draw polygon from WKT if available
    if (wkt) {
      const coords = parseWKTPolygon(wkt);
      if (coords.length > 0) {
        const poly = L.polygon(coords, {
          color: '#a67830',
          fillColor: '#d4b67e',
          fillOpacity: 0.3,
          weight: 2,
        }).addTo(map);
        polygonRef.current = poly;
        map.fitBounds(poly.getBounds(), { padding: [20, 20] });
      }
    }

    // Place marker at centroid
    if (lat != null && lng != null) {
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'place-marker',
          html: '<div style="width:12px;height:12px;background:#a67830;border:2px solid #503818;border-radius:50%;"></div>',
          iconSize: [12, 12],
          iconAnchor: [6, 6],
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
  }, [lat, lng, wkt, editable, onLocationChange]);

  return (
    <div
      ref={containerRef}
      className="w-full h-48 rounded border border-stm-warm-200"
      style={{ minHeight: '192px' }}
    />
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
