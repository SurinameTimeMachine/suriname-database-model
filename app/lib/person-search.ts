// Shared person/actor name normalization + client-side ranked search over
// the person-search shards. Name matching follows the existing codebase
// convention: case/diacritic-insensitive substring (see SearchBar.tsx and
// LinkedPersonsSection.tsx), ranked exact > prefix > word-boundary >
// substring, minimum 2 characters, top results capped.
//
// Shard layout (see scripts/build-person-search-index.ts):
//   person-search-index.json — plantation-linked names (enslaved, emancipated,
//     org-actor); small, fetched eagerly with the map payload.
//   ward-name-index.json — 52k distinct ward resident names; lazy-loaded on
//     first person-search focus so the initial map render stays untouched.
import type {
  PersonSearchActorRole,
  PersonSearchIndex,
  PersonSearchKind,
  PersonSearchRecord,
  PersonSearchRef,
} from './types';

/** Normalize a historical name: NFKD, strip diacritics, lowercase, single-space. */
export function normalizeName(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type RankedPersonHit = {
  record: PersonSearchRecord;
  /** Decoded display name (record.d ?? record.k). */
  display: string;
  /** Decoded kinds. */
  kinds: PersonSearchKind[];
  /** Union place IDs (map highlight fast-path). */
  placeIds: string[];
  /** Decoded union years (ward run-length pairs expanded). */
  years: number[];
  rank: 0 | 1 | 2 | 3;
};

/** Expand a record's year union (ward run-length pairs or plain years). */
export function personYears(record: PersonSearchRecord): number[] {
  if (!record.yr) return record.y;
  const years: number[] = [];
  for (let i = 0; i + 1 < record.y.length; i += 2) {
    for (let n = 0; n < record.y[i + 1]; n++) years.push(record.y[i] + n);
  }
  return years;
}

/** Decode a compact record's display name. */
export function personDisplay(record: PersonSearchRecord): string {
  return record.d ?? record.k;
}

const KIND_BITS: Array<[number, PersonSearchKind]> = [
  [1, 'enslaved'],
  [2, 'emancipated'],
  [4, 'ward-resident'],
  [8, 'org-actor'],
];

/** Decode a compact record's kind bitmask. */
export function personKinds(record: PersonSearchRecord): PersonSearchKind[] {
  return KIND_BITS.filter(([bit]) => record.b & bit).map(([, kind]) => kind);
}

const KIND_CODES: Record<PersonSearchRef['k'], PersonSearchKind> = {
  e: 'enslaved',
  m: 'emancipated',
  w: 'ward-resident',
  a: 'org-actor',
};

/** Full display label for a ref: emancipated variant, actor role, or status. */
export function refDetail(
  index: PersonSearchIndex,
  ref: PersonSearchRef,
): { kind: PersonSearchKind; org?: string; orgQid?: string | null; role?: PersonSearchActorRole; status?: 'free' | 'enslaved'; variant?: string; count: number } {
  const entry = ref.o != null ? index.orgs[ref.o] : undefined;
  return {
    kind: KIND_CODES[ref.k],
    org: entry?.[0],
    orgQid: entry?.[1],
    role: ref.r,
    status: ref.s,
    variant: ref.v,
    count: ref.c,
  };
}

function rankRecord(normalizedKey: string, normalizedQuery: string): 0 | 1 | 2 | 3 | null {
  if (normalizedKey === normalizedQuery) return 0;
  if (normalizedKey.startsWith(normalizedQuery)) return 1;
  // Word-boundary hit (any token starts with the query).
  for (const token of normalizedKey.split(' ')) {
    if (token.startsWith(normalizedQuery)) return 2;
  }
  if (normalizedKey.includes(normalizedQuery)) return 3;
  return null;
}

/**
 * Ranked substring search over an in-memory person-search index.
 * Returns at most `limit` hits ordered by match rank, then display name.
 * Prefer searchPersonShards() for multi-shard queries.
 */
export function searchPersons(
  index: PersonSearchIndex | null | undefined,
  query: string,
  limit = 25,
): RankedPersonHit[] {
  const normalizedQuery = normalizeName(query);
  if (!index || normalizedQuery.length < 2) return [];
  const hits: RankedPersonHit[] = [];
  for (const record of index.records) {
    const rank = rankRecord(record.k, normalizedQuery);
    if (rank == null) continue;
    hits.push({
      record,
      display: personDisplay(record),
      kinds: personKinds(record),
      placeIds: record.p,
      years: personYears(record),
      rank,
    });
  }
  hits.sort((a, b) => a.rank - b.rank || a.display.localeCompare(b.display));
  return hits.slice(0, limit);
}

let indexPromise: Promise<PersonSearchIndex | null> | null = null;
let wardIndexPromise: Promise<PersonSearchIndex | null> | null = null;

async function fetchShard(
  name: 'person-search-index.json' | 'ward-name-index.json',
): Promise<PersonSearchIndex | null> {
  try {
    const res = await fetch(`/data/${name}`);
    return res.ok ? ((await res.json()) as PersonSearchIndex) : null;
  } catch {
    return null;
  }
}

/**
 * Eager plantation-names shard (enslaved / emancipated / org-actor).
 * Safe to await alongside the map payload — small file, no ward names.
 */
export function loadPersonIndex(): Promise<PersonSearchIndex | null> {
  if (!indexPromise) {
    indexPromise = fetchShard('person-search-index.json');
  }
  return indexPromise;
}

/**
 * Lazy ward-names shard (52k distinct ward resident names).
 * Invoke on first person-search focus — never during initial map render.
 */
export function loadWardNameIndex(): Promise<PersonSearchIndex | null> {
  if (!wardIndexPromise) {
    wardIndexPromise = fetchShard('ward-name-index.json');
  }
  return wardIndexPromise;
}

/**
 * Merge two records sharing a normalized key (one per shard): union kind
 * bits, place IDs, expanded years, and refs. Years always expand through
 * personYears() first — plantation `y` holds plain years while ward `y`
 * holds run-length [start, length] pairs flagged by `yr`; the merge stores
 * plain years.
 */
function mergeSearchRecords(
  a: PersonSearchRecord,
  b: PersonSearchRecord,
): PersonSearchRecord {
  const placeIds = [...new Set([...a.p, ...b.p])].sort();
  const years = [...new Set([...personYears(a), ...personYears(b)])].sort(
    (x, y) => x - y,
  );
  const displayA = a.d ?? a.k;
  const displayB = b.d ?? b.k;
  return {
    k: a.k,
    ...(displayA.toLowerCase() === a.k && displayB.toLowerCase() === b.k
      ? {}
      : { d: displayA.length >= displayB.length ? displayA : displayB }),
    b: a.b | b.b,
    p: placeIds.length > 200 ? placeIds.slice(0, 200) : placeIds,
    y: years,
    r: [...a.r, ...b.r],
    ...(placeIds.length > 200 ? { t: true as const } : {}),
  };
}

/**
 * Ranked search over one or more loaded shards. Pass the eagerly loaded
 * plantation shard always, plus the ward shard once focused.
 */
export function searchPersonShards(
  shards: Array<PersonSearchIndex | null | undefined>,
  query: string,
  limit = 25,
): RankedPersonHit[] {
  const normalizedQuery = normalizeName(query);
  if (normalizedQuery.length < 2) return [];
  const merged = new Map<string, PersonSearchRecord>();
  for (const shard of shards) {
    if (!shard) continue;
    for (const record of shard.records) {
      const existing = merged.get(record.k);
      merged.set(
        record.k,
        existing ? mergeSearchRecords(existing, record) : record,
      );
    }
  }
  const hits: RankedPersonHit[] = [];
  for (const record of merged.values()) {
    const rank = rankRecord(record.k, normalizedQuery);
    if (rank == null) continue;
    hits.push({
      record,
      display: personDisplay(record),
      kinds: personKinds(record),
      placeIds: record.p,
      years: personYears(record),
      rank,
    });
  }
  hits.sort(
    (a, b) => a.rank - b.rank || a.display.localeCompare(b.display),
  );
  return hits.slice(0, limit);
}

/** Union of all place IDs across a set of ranked hits (map highlight fast-path). */
export function placeIdsForHits(hits: RankedPersonHit[]): string[] {
  const ids = new Set<string>();
  for (const hit of hits) {
    for (const placeId of hit.placeIds) ids.add(placeId);
  }
  return [...ids];
}
