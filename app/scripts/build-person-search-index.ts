/**
 * Build-time aggregation of person/actor names into compact client-side
 * search shards:
 *   - public/data/person-search-index.json — plantation-linked names
 *     (enslaved labels, post-1863 emancipated names, almanac actors);
 *     small, fetched eagerly with the map payload.
 *   - public/data/ward-name-index.json — 52k distinct ward register
 *     resident names; lazy-loaded on first person-search focus so the
 *     initial map render stays untouched.
 *
 * Sources (already emitted by prepare-data.ts):
 *   - persons-by-org.json      enslaved labels + post-1863 emancipated names
 *   - ward-residents-by-place.json  ward register observedPersons[].name
 *   - observations-by-org.json      almanac owner / administrator / director
 *
 * Org -> place resolution mirrors app/app/places/page.tsx:
 *   1. plantations.json entries whose hasOrganizationalAssociation == orgUri
 *      expose P53_has_location (E53 place URI) — mapped to gazetteer short
 *      IDs via the geo feature map below.
 *   2. Fallback: gazetteer QID match via organizations.json exactMatch /
 *      org QID suffix when no plantation bridge exists (kept as org-only
 *      ref with empty placeIds).
 *
 * Run with: tsx scripts/build-person-search-index.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  PersonSearchActorRole,
  PersonSearchIndex,
  PersonSearchKind,
  PersonSearchRecord,
  PersonSearchRef,
} from '../lib/types';

const APP_DIR = join(__dirname, '..');
const PUBLIC_DATA_DIR = join(APP_DIR, 'public/data');
const PERSON_INDEX_PATH = join(PUBLIC_DATA_DIR, 'person-search-index.json');
const WARD_INDEX_PATH = join(PUBLIC_DATA_DIR, 'ward-name-index.json');
const MAX_PLACE_IDS = 200;
// Raw-JSON budget per shard. Shards gzip ~7x (repetitive short strings), so
// 8 MB raw ≈ 1.1 MB on the wire — comparable to map-features.geojson.
const MAX_SHARD_BYTES = 8 * 1024 * 1024;
// Common single-token enslaved names are indistinguishable across orgs at
// search time (e.g. 219 "Johanna" refs); index them once per (name, org) so
// the record stays routable but the per-name ref fan-out collapses.
const SINGLE_TOKEN_REF_CAP = 12;
const PLANTATION_SPOT_CHECKS = ['adjuba', 'adolph vorm', 'homeyer'];
const WARD_SPOT_CHECKS = ['eduard joseph sacoto stuger'];

function normalizeName(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asYear(value: unknown): number | null {
  const year =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value.trim())
        : NaN;
  return Number.isInteger(year) ? year : null;
}

function orgQidFromUri(uri: string): string | null {
  const match = uri.match(/(Q\d+)\s*$/i);
  return match ? match[1].toUpperCase() : null;
}

type PlaceMaps = {
  e53UriToPlaceShortId: Map<string, string>;
  orgUriToPlaceIds: Map<string, string[]>;
};

function buildPlaceMaps(
  plantations: Record<string, Record<string, unknown>>,
  organizations: Record<string, Record<string, unknown>>,
  geoFeatures: Array<Record<string, unknown>>,
): PlaceMaps {
  // E53 place URI -> gazetteer short id (stm-*) via the geo feature props.
  const e53UriToPlaceShortId = new Map<string, string>();
  for (const feature of geoFeatures) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const stmId = asString(props.stmId);
    const placeUri = asString(props.placeUri);
    if (stmId && placeUri && !e53UriToPlaceShortId.has(placeUri)) {
      e53UriToPlaceShortId.set(placeUri, stmId);
    }
  }
  // E25 plantation URI -> E53 place URI -> short id.
  const plantationUriToPlaceId = new Map<string, string>();
  for (const [uri, plantation] of Object.entries(plantations)) {
    const placeUri = asString(plantation.P53_has_location);
    const shortId = placeUri ? e53UriToPlaceShortId.get(placeUri) : undefined;
    if (shortId) plantationUriToPlaceId.set(uri, shortId);
  }
  // Gazetteer QID -> short ids (fallback bridge when no plantation link).
  const qidToPlaceIds = new Map<string, Set<string>>();
  for (const feature of geoFeatures) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const stmId = asString(props.stmId);
    const qid = asString(props.wikidataQid).toUpperCase();
    if (!stmId || !qid) continue;
    let bucket = qidToPlaceIds.get(qid);
    if (!bucket) {
      bucket = new Set<string>();
      qidToPlaceIds.set(qid, bucket);
    }
    bucket.add(stmId);
  }
  // Org URI -> place ids via its plantations, else via gazetteer QID.
  const orgUriToPlaceIds = new Map<string, string[]>();
  for (const [orgUri, organization] of Object.entries(organizations)) {
    const ids = new Set<string>();
    for (const plantation of Object.values(plantations)) {
      if (
        asString(plantation.hasOrganizationalAssociation) === orgUri &&
        asString(plantation['@id'])
      ) {
        const placeId = plantationUriToPlaceId.get(
          asString(plantation['@id']),
        );
        if (placeId) ids.add(placeId);
      }
    }
    if (ids.size === 0) {
      const qid =
        orgQidFromUri(asString(organization.exactMatch)) ??
        orgQidFromUri(orgUri);
      const fallback = qid ? qidToPlaceIds.get(qid) : undefined;
      for (const placeId of fallback ?? []) ids.add(placeId);
    }
    if (ids.size > 0) orgUriToPlaceIds.set(orgUri, [...ids].sort());
  }
  return { e53UriToPlaceShortId, orgUriToPlaceIds };
}

type NameSink = Map<
  string,
  {
    display: string;
    refs: PersonSearchRef[];
    kinds: Set<PersonSearchKind>;
    years: Set<number>;
    bitmask: number;
  }
>;

const KIND_CODE: Record<PersonSearchKind, PersonSearchRef['k']> = {
  enslaved: 'e',
  emancipated: 'm',
  'ward-resident': 'w',
  'org-actor': 'a',
};
const KIND_BIT: Record<PersonSearchKind, number> = {
  enslaved: 1,
  emancipated: 2,
  'ward-resident': 4,
  'org-actor': 8,
};

type BuilderRef = {
  kind: PersonSearchKind;
  org?: string;
  role?: PersonSearchActorRole;
  count: number;
};

function addName(
  sink: NameSink,
  raw: string | null | undefined,
  ref: BuilderRef,
): void {
  const key = normalizeName(raw);
  if (!key || !raw) return;
  let entry = sink.get(key);
  if (!entry) {
    entry = {
      display: raw.trim(),
      kinds: new Set(),
      refs: [],
      years: new Set(),
      bitmask: 0,
    };
    sink.set(key, entry);
  }
  entry.kinds.add(ref.kind);
  entry.bitmask |= KIND_BIT[ref.kind];
  const existing = entry.refs.find(
    (candidate) =>
      candidate.k === KIND_CODE[ref.kind] &&
      candidate.o === orgIndexFor(ref.org) &&
      candidate.r === ref.role,
  );
  if (existing) {
    existing.c += ref.count;
  } else {
    entry.refs.push({
      k: KIND_CODE[ref.kind],
      ...(ref.org != null ? { o: orgIndexFor(ref.org) } : {}),
      ...(ref.role != null ? { r: ref.role } : {}),
      c: ref.count,
    });
  }
}

// Org dedupe table: org URI -> compact int. Place IDs and QIDs resolve
// through this table at query time (see lib/person-search.ts refDetail()).
const orgTable = new Map<string, number>();
const orgRows: Array<{ uri: string; qid: string | null; places: string[] }> =
  [];

function orgIndexFor(org: string | undefined): number | undefined {
  if (!org) return undefined;
  let index = orgTable.get(org);
  if (index == null) {
    index = orgRows.length;
    orgTable.set(org, index);
    orgRows.push({ uri: org, qid: orgQidFromUri(org), places: [] });
  }
  return index;
}

function setOrgPlaces(orgUriToPlaceIds: Map<string, string[]>): void {
  for (const [uri, index] of orgTable) {
    orgRows[index].places = orgUriToPlaceIds.get(uri) ?? [];
  }
}

type WardOccurrence = { placeId: string; years: number[]; count: number };

type WardSinkEntry = {
  display: string;
  occurrences: WardOccurrence[];
  statuses: Set<string>;
  years: Set<number>;
};

function buildRecords(
  sink: NameSink,
  orgPlaces: (orgIndex: number) => string[],
): PersonSearchRecord[] {
  const records: PersonSearchRecord[] = [];
  for (const [key, entry] of [...sink.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    // Cap single-token ref fan-out: "Johanna" x 219 orgs collapses to the
    // top refs by attestation count; the record union still routes the map.
    let refs = entry.refs;
    if (!key.includes(' ') && refs.length > SINGLE_TOKEN_REF_CAP) {
      refs = [...refs]
        .sort((a, b) => b.c - a.c || (a.o ?? 0) - (b.o ?? 0))
        .slice(0, SINGLE_TOKEN_REF_CAP);
    }
    // Record-level place/year unions resolve through the org table, so
    // refs stay minimal (org int + kind + count + role/status/variant).
    const placeSet = new Set<string>();
    for (const ref of refs) {
      if (ref.o != null) {
        for (const placeId of orgPlaces(ref.o)) placeSet.add(placeId);
      }
    }
    const placeIds = [...placeSet].sort();
    const matchYears = [...entry.years].sort((a, b) => a - b);
    const truncated = placeIds.length > MAX_PLACE_IDS;
    records.push({
      k: key,
      ...(entry.display.toLowerCase() === key ? {} : { d: entry.display }),
      b: entry.bitmask,
      p: truncated ? placeIds.slice(0, MAX_PLACE_IDS) : placeIds,
      y: matchYears,
      r: refs,
      ...(truncated ? { t: true as const } : {}),
    });
  }
  return records;
}

function buildWardRecords(wardSink: Map<string, WardSinkEntry>): PersonSearchRecord[] {
  const records: PersonSearchRecord[] = [];
  for (const [key, entry] of [...wardSink.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    // Ward years are near-contiguous (1828-1847): run-length encode as
    // [start, length] pairs to halve the year-array bytes.
    const sortedYears = [...entry.years].sort((a, b) => a - b);
    const runs: number[] = [];
    let runStart: number | null = null;
    let runPrev = 0;
    for (const year of sortedYears) {
      if (runStart == null) {
        runStart = year;
        runPrev = year;
      } else if (year === runPrev + 1) {
        runPrev = year;
      } else {
        runs.push(runStart, runPrev - runStart + 1);
        runStart = year;
        runPrev = year;
      }
    }
    if (runStart != null) runs.push(runStart, runPrev - runStart + 1);
    const placeIds = [
      ...new Set(entry.occurrences.map((o) => o.placeId)),
    ].sort();
    const truncated = placeIds.length > MAX_PLACE_IDS;
    const statuses = [...entry.statuses] as Array<'free' | 'enslaved'>;
    records.push({
      k: key,
      ...(entry.display.toLowerCase() === key ? {} : { d: entry.display }),
      b: KIND_BIT['ward-resident'],
      p: truncated ? placeIds.slice(0, MAX_PLACE_IDS) : placeIds,
      y: runs,
      yr: true as const,
      r: [
        {
          k: 'w',
          c: entry.occurrences.reduce((sum, o) => sum + o.count, 0),
          ...(statuses.length === 1 ? { s: statuses[0] } : {}),
        },
      ],
      ...(truncated ? { t: true as const } : {}),
    });
  }
  return records;
}

function collectPersonYears(observation: Record<string, unknown>): number[] {
  const years: number[] = [];
  for (const field of ['startYear', 'endYear']) {
    const year = asYear(observation[field]);
    if (year != null) years.push(year);
  }
  return years;
}

function main(): void {
  const personsByOrg = readJson<Record<string, Array<Record<string, unknown>>>>(
    join(PUBLIC_DATA_DIR, 'persons-by-org.json'),
  );
  const wardByPlace = readJson<Record<string, Array<Record<string, unknown>>>>(
    join(PUBLIC_DATA_DIR, 'ward-residents-by-place.json'),
  );
  const observationsByOrg = readJson<
    Record<string, Array<Record<string, unknown>>>
  >(join(PUBLIC_DATA_DIR, 'observations-by-org.json'));
  const plantations = readJson<Record<string, Record<string, unknown>>>(
    join(PUBLIC_DATA_DIR, 'plantations.json'),
  );
  const organizations = readJson<Record<string, Record<string, unknown>>>(
    join(PUBLIC_DATA_DIR, 'organizations.json'),
  );
  const geojson = readJson<{ features?: Array<Record<string, unknown>> }>(
    join(PUBLIC_DATA_DIR, 'map-features.geojson'),
  );
  if (!personsByOrg || !wardByPlace || !observationsByOrg) {
    throw new Error(
      'Missing person sources: run prepare-data.ts before build-person-search-index.ts',
    );
  }
  const { orgUriToPlaceIds } = buildPlaceMaps(
    plantations ?? {},
    organizations ?? {},
    geojson?.features ?? [],
  );

  const plantationSink: NameSink = new Map();
  const wardSink = new Map<string, WardSinkEntry>();

  // 1. Enslaved persons + post-1863 emancipated names (via org -> places).
  // Years accumulate on the record union; refs stay minimal (org + count).
  for (const [orgUri, persons] of Object.entries(personsByOrg)) {
    orgIndexFor(orgUri);
    for (const person of persons) {
      const observations =
        (person.observations as Array<Record<string, unknown>> | undefined) ??
        [];
      const observationCount = observations.length || 1;
      const label = asString(person.label);
      if (label) {
        addPersonName(plantationSink, label, 'enslaved', orgUri, observationCount);
        for (const observation of observations) {
          for (const year of collectPersonYears(observation)) {
            plantationSink.get(normalizeName(label))?.years.add(year);
          }
        }
      }
      // Post-1863 free name: person-level and per-observation variants.
      const emancipatedVariants = new Set<string>();
      const personVariant = [asString(person.emancipationFirstName), asString(person.emancipationFamilyName)]
        .filter(Boolean)
        .join(' ');
      if (personVariant) emancipatedVariants.add(personVariant);
      for (const observation of observations) {
        const variant = [
          asString(observation.emancipationFirstName),
          asString(observation.emancipationFamilyName),
        ]
          .filter(Boolean)
          .join(' ');
        if (variant) emancipatedVariants.add(variant);
      }
      for (const variant of emancipatedVariants) {
        if (normalizeName(variant) === normalizeName(label)) continue;
        // Skip single-token emancipated variants identical to the key shape:
        // they add no routing value beyond the enslaved record itself.
        addPersonName(
          plantationSink,
          variant,
          'emancipated',
          orgUri,
          observationCount,
        );
        for (const observation of observations) {
          for (const year of collectPersonYears(observation)) {
            plantationSink.get(normalizeName(variant))?.years.add(year);
          }
        }
      }
    }
  }

  // 2. Ward register residents — place key is direct; separate shard so the
  // plantation shard stays small enough for eager load.
  for (const [placeId, links] of Object.entries(wardByPlace)) {
    for (const link of links) {
      const year = asYear(link.year);
      for (const observed of (link.observedPersons as Array<Record<string, unknown>> | undefined) ?? []) {
        const name = asString(observed.name);
        if (!name) continue; // unnamed matrix persons: not searchable
        const key = normalizeName(name);
        let entry = wardSink.get(key);
        if (!entry) {
          entry = {
            display: name.trim(),
            occurrences: [],
            statuses: new Set(),
            years: new Set(),
          };
          wardSink.set(key, entry);
        }
        entry.occurrences.push({
          placeId,
          years: year != null ? [year] : [],
          count: 1,
        });
        if (observed.status === 'free' || observed.status === 'enslaved') {
          entry.statuses.add(observed.status);
        }
        if (year != null) entry.years.add(year);
      }
    }
  }

  // 3. Almanac organization actors (owner / administrator / director).
  const actorFields: Array<{ field: string; role: PersonSearchActorRole }> = [
    { field: 'hasOwner', role: 'owner' },
    { field: 'hasAdministrator', role: 'administrator' },
    { field: 'hasDirector', role: 'director' },
  ];
  for (const [orgUri, obsList] of Object.entries(observationsByOrg)) {
    orgIndexFor(orgUri);
    for (const observation of obsList) {
      const year = asYear(observation.observationYear);
      for (const { field, role } of actorFields) {
        const value = asString(observation[field]);
        if (!value) continue;
        addActorName(plantationSink, value, orgUri, role);
        if (year != null) {
          plantationSink.get(normalizeName(value))?.years.add(year);
        }
      }
    }
  }

  setOrgPlaces(orgUriToPlaceIds);
  const orgPlacesFor = (orgIndex: number): string[] =>
    orgRows[orgIndex]?.places ?? [];

  writeShard(
    PERSON_INDEX_PATH,
    buildRecords(plantationSink, orgPlacesFor),
    PLANTATION_SPOT_CHECKS,
    'person-search-index.json',
  );
  writeShard(
    WARD_INDEX_PATH,
    buildWardRecords(wardSink),
    WARD_SPOT_CHECKS,
    'ward-name-index.json',
  );
}

/** Add an enslaved / emancipated name occurrence (org-linked). */
function addPersonName(
  sink: NameSink,
  raw: string,
  kind: 'enslaved' | 'emancipated',
  org: string,
  count: number,
): void {
  addName(sink, raw, { kind, org, count });
}

/** Add an almanac actor occurrence (org-linked, role-qualified). */
function addActorName(
  sink: NameSink,
  raw: string,
  org: string,
  role: PersonSearchActorRole,
): void {
  addName(sink, raw, { kind: 'org-actor', org, role, count: 1 });
}

function writeShard(
  path: string,
  records: PersonSearchRecord[],
  spotChecks: string[],
  label: string,
): void {
  const document: PersonSearchIndex = {
    version: 2,
    generatedAt: new Date().toISOString(),
    normalization: 'nfkd-lower-strip-diacritics-single-space',
    recordCount: records.length,
    orgs: orgRows.map(
      (row): [string, string | null, string[]] => [row.uri, row.qid, row.places],
    ),
    records,
  };
  const serialized = JSON.stringify(document);
  writeFileSync(path, serialized);
  const sizeMB = (Buffer.byteLength(serialized) / 1024 / 1024).toFixed(2);
  console.log(`  Wrote ${label} (${sizeMB} MB, ${records.length} names)`);
  if (Buffer.byteLength(serialized) > MAX_SHARD_BYTES) {
    throw new Error(`${label} exceeds 8 MB cap (${sizeMB} MB)`);
  }
  const keys = new Set(records.map((record) => record.k));
  const missing = spotChecks.filter(
    (name) =>
      !keys.has(name) &&
      !records.some((record) => record.k.includes(name)),
  );
  if (missing.length > 0) {
    throw new Error(`${label} spot-checks missing: ${missing.join(', ')}`);
  }
  console.log(`  Spot-checks OK: ${spotChecks.join(' / ')}`);
}

main();
