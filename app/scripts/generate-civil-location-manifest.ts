/**
 * Dual-track civil location manifest generator (Step 1 of the
 * civil-location-matching workflow — see
 * docs/ingestion/civil-location-matching-workflow.md).
 *
 * Reads the raw unmapped output of transform-civil-records.ts
 * (data/unmapped-civil-locations.json, now year-aware via entry.years),
 * proposes candidates against:
 *   1. street-standardization aliases (street_alias_exact),
 *   2. Concordans Paramaribo derived rows (concordance_exact),
 *   3. bare street-name evidence (street_name_only),
 *   4. plantation normalization (plantation_normalized),
 *   5. district keywords (district_keyword),
 *   6. relative phrases inheriting the primary subject (relative_phrase),
 *   7. Jaro-Winkler fuzzy fallback (fuzzy_jaro_winkler, never Track A).
 *
 * Emits:
 *   - data/civil-locations-track-a.json — high-confidence gate output for
 *     live index ingestion (regenerated freely).
 *   - data/evaluation/civil-locations-eval-v1.json — versioned Track B
 *     manifest with machine candidates + preserved manual_review fields.
 *
 * SAFETY: existing manifests and data/civil-location-manual-overrides.json
 * are load-merged, never overwritten: manual_review.status,
 * approved_place_id, and notes survive every run. New matching logic bumps
 * the manifest version instead of mutating a published file.
 *
 * Env flags:
 *   CIVIL_TRACK_A_ONLY=1 — print Track A summary only (for index builders).
 *   CIVIL_EVAL_VERSION=vN — target manifest version (default v1).
 *
 * Run: tsx scripts/generate-civil-location-manifest.ts
 * Or:  pnpm manifest:civil-locations
 */
import { parse } from 'csv-parse/sync';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_DIR = join(__dirname, '..');
const BASE_DIR = join(APP_DIR, '..');
const UNMAPPED_PATH = join(BASE_DIR, 'data/unmapped-civil-locations.json');
const STREET_STD_CSV = join(
  BASE_DIR,
  'data/04-ward-registers - Paramaribo Ward Registers 1828-1847/Standardization of street names/street standardization 20240328.csv',
);
const CONCORDANS_DERIVED_CSV = join(
  BASE_DIR,
  'data/concordans-paramaribo/concordans-paramaribo-derived.csv',
);
const EVAL_DIR = join(BASE_DIR, 'data/evaluation');
const EVAL_VERSION = process.env.CIVIL_EVAL_VERSION ?? 'v1';
const EVAL_PATH = join(EVAL_DIR, `civil-locations-eval-${EVAL_VERSION}.json`);
const OVERRIDES_PATH = join(
  BASE_DIR,
  'data/civil-location-manual-overrides.json',
);
const TRACK_A_PATH = join(BASE_DIR, 'data/civil-locations-track-a.json');

// --- Types (mirror the workflow doc schema) ---

export type MatchReason =
  | 'thesaurus_exact'
  | 'street_alias_exact'
  | 'concordance_exact'
  | 'street_name_only'
  | 'plantation_normalized'
  | 'district_keyword'
  | 'relative_phrase'
  | 'fuzzy_jaro_winkler';

export interface LocationCandidate {
  place_id: string | null;
  matched_label: string | null;
  match_score: number;
  match_reason: MatchReason;
}

export type ManualStatus = 'pending' | 'approved' | 'rejected' | 'custom_override';

export interface LocationTuple {
  tuple_id: string;
  raw_location_string: string;
  normalized_location_string: string;
  observation_year: number | null;
  occurrence_count: number;
  field_origins: string[];
  example_record_ids: string[];
  track: 'A' | 'B';
  top_candidate: LocationCandidate;
  alternative_candidates: LocationCandidate[];
  coordinates_pending: boolean;
  manual_review: {
    status: ManualStatus;
    approved_place_id: string | null;
    notes: string;
  };
}

interface UnmappedEntry {
  raw: string;
  count: number;
  fieldOrigin: string;
  exampleRecordIds: string[];
  years?: number[];
  yearCounts?: number[];
}

// --- Normalization (shared with transform-civil-records.ts) ---

function normalizeLocation(raw: string): string {
  return raw
    .replace(/\s*\(.*\)\s*$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tupleId(normalized: string, year: number | null): string {
  const slug = normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `${slug}_${year ?? 'year_null'}`;
}

function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (!bMatches[j] && a[i] === b[j]) {
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

// --- Reference data ---

function loadStreetAliases(): Map<string, string> {
  const index = new Map<string, string>();
  if (!existsSync(STREET_STD_CSV)) return index;
  const raw = readFileSync(STREET_STD_CSV, 'latin1').replace(/^﻿/, '');
  for (const line of raw.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const fields = line.split(';');
    const variant = normalizeLocation(fields[1] ?? '');
    const canonical = (fields[2] ?? '').trim();
    if (variant && canonical && !index.has(variant)) index.set(variant, canonical);
  }
  return index;
}

function loadConcordansStreets(): Set<string> {
  const streets = new Set<string>();
  if (!existsSync(CONCORDANS_DERIVED_CSV)) return streets;
  const rows = parse(readFileSync(CONCORDANS_DERIVED_CSV, 'utf-8'), {
    columns: true,
    delimiter: ',',
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Array<Record<string, string>>;
  for (const row of rows) {
    // Concordans columns: address2022/address1921 modern names plus
    // per-era street cells (wijk1782Street etc.) and normalized forms.
    for (const key of [
      'address2022',
      'address1921',
      'wijk1782Street',
      'normalized1885Derived',
      'normalized1885Cell',
    ]) {
      const street = normalizeLocation(row[key] ?? '');
      if (street) streets.add(street);
    }
  }
  return streets;
}

// --- Candidate matching ---

const RELATIVE_PHRASE_RE =
  /voormeld|voornoemd|bovengemeld|aldaar|alhier|hier|deze kolonie|dit district|garnizoen/i;
const DISTRICT_RE =
  /\b(paramaribo|suriname|nickerie|coronie|saramacca|commewijne|marowijne|para)\b/i;
const BRT_CODE_RE = /^[a-z]\s*\d+$/i;

function proposeCandidates(
  normalized: string,
  raw: string,
  streetAliases: Map<string, string>,
  concordansStreets: Set<string>,
): { top: LocationCandidate; alternatives: LocationCandidate[]; coordinatesPending: boolean } {
  const alternatives: LocationCandidate[] = [];
  const bareStreet = normalized.replace(/\s*\(.*\)\s*$/, '').trim();

  // 1. Street alias exact.
  const alias = streetAliases.get(normalized) ?? streetAliases.get(bareStreet);
  if (alias) {
    return {
      top: {
        place_id: null,
        matched_label: alias,
        match_score: 1,
        match_reason: 'street_alias_exact',
      },
      alternatives,
      coordinatesPending: false,
    };
  }

  // 2. Concordans exact.
  if (concordansStreets.has(normalized) || concordansStreets.has(bareStreet)) {
    return {
      top: {
        place_id: null,
        matched_label: bareStreet,
        match_score: 0.95,
        match_reason: 'concordance_exact',
      },
      alternatives,
      coordinatesPending: false,
    };
  }

  // 3. Relative phrase → inherits primary subject (Track A by rule, but
  // ONLY for clean short forms: "in voormeld huis", "aldaar", "alhier".
  // Longer phrases ("aan boord van voormeld schip", "... ter plaatse
  // voormeld") carry their own location semantics (ships!) and stay Track B.
  if (
    /^(in\s+)?voormeld\s+huis|^(in\s+)?voornoemd\s+huis|^aldaar$|^alhier$|^hier$/i.test(
      raw.trim(),
    )
  ) {
    return {
      top: {
        place_id: null,
        matched_label: 'derived_from_primary_subject',
        match_score: 1,
        match_reason: 'relative_phrase',
      },
      alternatives,
      coordinatesPending: false,
    };
  }

  // 4. Bare street name evidence (post-1885 streets land here).
  if (/^[a-zà-ÿ\s'’-]+$/i.test(raw.replace(/\s*\(.*\)\s*$/, ''))) {
    alternatives.push({
      place_id: null,
      matched_label: bareStreet,
      match_score: 0.7,
      match_reason: 'street_name_only',
    });
  }

  // 5. Plantation normalization.
  if (/^plantage\s+/i.test(raw)) {
    const plantation = bareStreet.replace(/^plantage\s+/, '');
    return {
      top: {
        place_id: null,
        matched_label: plantation,
        match_score: 0.75,
        match_reason: 'plantation_normalized',
      },
      alternatives,
      coordinatesPending: true,
    };
  }

  // 6. District keyword.
  if (DISTRICT_RE.test(raw) || BRT_CODE_RE.test(normalized)) {
    return {
      top: {
        place_id: null,
        matched_label: bareStreet,
        match_score: 0.6,
        match_reason: 'district_keyword',
      },
      alternatives,
      coordinatesPending: true,
    };
  }

  // 7. Fuzzy fallback over street aliases (never Track A).
  let bestAlias: string | null = null;
  let bestScore = 0;
  for (const variant of streetAliases.keys()) {
    const score = jaroWinkler(normalized, variant);
    if (score > bestScore) {
      bestScore = score;
      bestAlias = variant;
    }
  }
  if (bestAlias && bestScore >= 0.88) {
    alternatives.push({
      place_id: null,
      matched_label: streetAliases.get(bestAlias) ?? bestAlias,
      match_score: Number(bestScore.toFixed(3)),
      match_reason: 'fuzzy_jaro_winkler',
    });
  }

  // Default top: first alternative or unresolved placeholder.
  const top: LocationCandidate = alternatives[0] ?? {
    place_id: null,
    matched_label: null,
    match_score: 0,
    match_reason: 'street_name_only',
  };
  return {
    top,
    alternatives: alternatives.slice(1, 4),
    coordinatesPending: top.match_reason !== 'relative_phrase',
  };
}

// Track A gate: deterministic exact rules only (see workflow doc §4).
function isTrackA(candidate: LocationCandidate, raw: string): boolean {
  if (
    candidate.match_reason === 'street_alias_exact' ||
    candidate.match_reason === 'concordance_exact' ||
    candidate.match_reason === 'relative_phrase'
  ) {
    // Parenthetical qualifiers stripped → not deterministic.
    if (/\([^)]*\)/.test(raw)) return false;
    return candidate.match_score >= 0.95;
  }
  return false;
}

// --- Safety merge ---

function loadManualState(): Map<string, LocationTuple['manual_review']> {
  const merged = new Map<string, LocationTuple['manual_review']>();
  // Cross-version overrides file wins over per-version manifests.
  if (existsSync(OVERRIDES_PATH)) {
    const doc = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf-8')) as {
      overrides?: Array<{
        tuple_id: string;
        status: ManualStatus;
        approved_place_id: string | null;
        notes: string;
      }>;
    };
    for (const override of doc.overrides ?? []) {
      merged.set(override.tuple_id, {
        status: override.status,
        approved_place_id: override.approved_place_id,
        notes: override.notes,
      });
    }
  }
  if (existsSync(EVAL_PATH)) {
    const doc = JSON.parse(readFileSync(EVAL_PATH, 'utf-8')) as {
      tuples?: LocationTuple[];
    };
    for (const tuple of doc.tuples ?? []) {
      // Manifest decisions fill gaps; overrides file already wins.
      if (!merged.has(tuple.tuple_id)) merged.set(tuple.tuple_id, tuple.manual_review);
    }
  }
  return merged;
}

// --- Main ---

export interface ManifestResult {
  tuples: LocationTuple[];
  trackACount: number;
  trackBCount: number;
  preservedReviews: number;
}

export function generateCivilLocationManifest(): ManifestResult {
  if (!existsSync(UNMAPPED_PATH)) {
    throw new Error(
      `Missing ${UNMAPPED_PATH}: run pnpm transform:civil-records first`,
    );
  }
  const doc = JSON.parse(readFileSync(UNMAPPED_PATH, 'utf-8')) as {
    locations?: UnmappedEntry[];
  };
  const streetAliases = loadStreetAliases();
  const concordansStreets = loadConcordansStreets();
  console.log(
    `Loaded ${(doc.locations ?? []).length} unmapped strings, ` +
      `${streetAliases.size} street aliases, ${concordansStreets.size} concordans streets`,
  );
  const priorReviews = loadManualState();
  console.log(`Merging ${priorReviews.size} prior manual decisions (preserved)`);

  // Aggregate raw strings across field origins, keeping per-year counts
  // so each (normalized, year) tuple reports its own occurrence frequency.
  const byNormalized = new Map<
    string,
    {
      raw: string;
      origins: Set<string>;
      examples: string[];
      yearCounts: Map<number, number>;
      nullCount: number;
    }
  >();
  for (const entry of doc.locations ?? []) {
    const normalized = normalizeLocation(entry.raw);
    if (!normalized) continue;
    let bucket = byNormalized.get(normalized);
    if (!bucket) {
      bucket = {
        raw: entry.raw,
        origins: new Set(),
        examples: [],
        yearCounts: new Map(),
        nullCount: 0,
      };
      byNormalized.set(normalized, bucket);
    }
    bucket.origins.add(entry.fieldOrigin);
    for (const id of entry.exampleRecordIds) {
      if (bucket.examples.length < 5) bucket.examples.push(id);
    }
    const years = entry.years ?? [];
    const counts = entry.yearCounts ?? [];
    if (years.length === 0) {
      bucket.nullCount += entry.count;
    }
    years.forEach((year, index) => {
      bucket!.yearCounts.set(
        year,
        (bucket!.yearCounts.get(year) ?? 0) + (counts[index] ?? 0),
      );
    });
  }

  const tuples: LocationTuple[] = [];
  let preservedReviews = 0;
  for (const [normalized, bucket] of [...byNormalized.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    // One tuple per (normalized, year) with that year's own frequency;
    // year-less occurrences collapse into a single year_null tuple.
    const yearEntries: Array<[number | null, number]> = [
      ...[...bucket.yearCounts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map((entry): [number, number] => [entry[0], entry[1]]),
      ...(bucket.nullCount > 0 ? [[null, bucket.nullCount] as [null, number]] : []),
    ];
    for (const [year, count] of yearEntries) {
      const id = tupleId(normalized, year);
      const { top, alternatives, coordinatesPending } = proposeCandidates(
        normalized,
        bucket.raw,
        streetAliases,
        concordansStreets,
      );
      const track = isTrackA(top, bucket.raw) ? 'A' : 'B';
      const prior = priorReviews.get(id);
      if (prior) preservedReviews++;
      tuples.push({
        tuple_id: id,
        raw_location_string: bucket.raw,
        normalized_location_string: normalized,
        observation_year: year,
        occurrence_count: count,
        field_origins: [...bucket.origins].sort(),
        example_record_ids: bucket.examples,
        track,
        top_candidate: top,
        alternative_candidates: alternatives,
        coordinates_pending: track === 'A' ? false : coordinatesPending,
        manual_review: prior ?? {
          status: 'pending',
          approved_place_id: null,
          notes: '',
        },
      });
    }
  }

  const trackA = tuples.filter((t) => t.track === 'A');
  const trackB = tuples.filter((t) => t.track === 'B');
  console.log(
    `  Tuples: ${tuples.length} (Track A: ${trackA.length}, Track B: ${trackB.length}); preserved reviews: ${preservedReviews}`,
  );

  // Track A gate output (regenerated freely — machine-derived only).
  mkdirSync(BASE_DIR + '/data', { recursive: true });
  writeFileSync(
    TRACK_A_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        evalVersion: EVAL_VERSION,
        count: trackA.length,
        tuples: trackA,
      },
      null,
      1,
    ),
  );
  console.log(`  Wrote ${TRACK_A_PATH}`);

  // Versioned Track B manifest: machine fields refresh, human fields preserved.
  mkdirSync(EVAL_DIR, { recursive: true });
  writeFileSync(
    EVAL_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        version: EVAL_VERSION,
        count: trackB.length,
        tuples: trackB,
      },
      null,
      1,
    ),
  );
  console.log(`  Wrote ${EVAL_PATH}`);

  return {
    tuples,
    trackACount: trackA.length,
    trackBCount: trackB.length,
    preservedReviews,
  };
}

if (require.main === module) {
  console.log('=== Civil Location Manifest (dual-track, Step 1) ===\n');
  const result = generateCivilLocationManifest();
  if (process.env.CIVIL_TRACK_A_ONLY === '1') {
    console.log(
      `\nTrack A gate: ${result.trackACount} tuples eligible for live ingestion`,
    );
  }
  console.log('\n=== Done ===');
}
