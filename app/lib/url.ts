/**
 * Shared URL builders and parsers for deep-linkable navigation.
 *
 * Query-param routes:
 *   /places?place={id}      — stm-00001
 *   /explore?place={id}&z={zoom}&lat={lat}&lng={lng}
 *   /model?entity={crmId}   — e25
 *
 * Path routes:
 *   /sources/{sourceId}     — map-1930
 *   /vocabulary/{typeId}    — plantation
 */

/* ─── Default map viewport ─────────────────────────────────────── */
export const DEFAULT_CENTER: [number, number] = [5.5, -55.2];
export const DEFAULT_ZOOM = 8;

/* ─── Path-based URL builders ──────────────────────────────────── */
export function buildSourceUrl(sourceId: string): string {
  return `/sources/${encodeURIComponent(sourceId)}`;
}

export function buildVocabularyUrl(typeId: string): string {
  return `/vocabulary/${encodeURIComponent(typeId)}`;
}

/* ─── Query-param URL builders ─────────────────────────────────── */
export function buildExploreUrl(opts?: {
  place?: string;
  z?: number;
  lat?: number;
  lng?: number;
}): string {
  const params = new URLSearchParams();
  if (opts?.place) params.set('place', opts.place);
  if (opts?.z != null) params.set('z', String(Math.round(opts.z)));
  if (opts?.lat != null) params.set('lat', opts.lat.toFixed(4));
  if (opts?.lng != null) params.set('lng', opts.lng.toFixed(4));
  const qs = params.toString();
  return qs ? `/explore?${qs}` : '/explore';
}

export function buildModelUrl(entityId: string): string {
  return `/model?entity=${encodeURIComponent(entityId)}`;
}

/* ─── Parsers ──────────────────────────────────────────────────── */
export interface ExploreParams {
  place: string | null;
  z: number | null;
  lat: number | null;
  lng: number | null;
}

function parseFiniteNumber(
  raw: string | null,
  min?: number,
  max?: number,
): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (min != null && n < min) return null;
  if (max != null && n > max) return null;
  return n;
}

export function parseExploreParams(
  searchParams: URLSearchParams,
): ExploreParams {
  const place = searchParams.get('place');

  return {
    place: place || null,
    z: parseFiniteNumber(searchParams.get('z'), 0, 22),
    lat: parseFiniteNumber(searchParams.get('lat'), -90, 90),
    lng: parseFiniteNumber(searchParams.get('lng'), -180, 180),
  };
}
