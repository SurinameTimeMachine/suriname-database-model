import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

type NasRow = {
  source: string;
  detailId: string;
  mediaId: string;
  recordKey: string;
  detailUrl: string;
  listingPage: number;
  title: string;
  description: string;
  documentType: string;
  inventoryNumber: string;
  maker: string;
  yearRaw: string;
  personsRaw: string;
  colorRaw: string;
  collectionRaw: string;
  keywordsRaw: string;
  downloadableRaw: string;
  playtimeRaw: string;
  mediaType: 'image' | 'video' | 'audio' | 'unknown';
};

type GazetteerPlace = {
  id: string;
  type: string;
  names: Array<{ text: string; isPreferred?: boolean }>;
};

type PlaceDictionaryEntry = {
  category: string;
  source: 'stm-gazetteer' | 'paramaribo-street-standardization' | 'plantages-dataset';
  original: string;
  normalized: string;
  canonical: string;
  gazetteerId: string;
};

type HitRow = {
  recordKey: string;
  detailId: string;
  mediaId: string;
  mediaType: string;
  inventoryNumber: string;
  yearRaw: string;
  field: 'title' | 'description' | 'keywords' | 'personsRaw';
  hitType: 'place' | 'person';
  category: string;
  matchedTerm: string;
  matchedTermNormalized: string;
  canonicalName: string;
  matchSource: string;
  stmGazetteerId: string;
  ambiguityCount: number;
  title: string;
  snippet: string;
  lowHangingSpecific: boolean;
  reviewBucket: 'high-precision' | 'needs-review' | 'ambiguous';
};

const NAS_PATH = join(__dirname, '../..', 'data', 'nas-mediabank', 'nas-mediabank-records.json');
const GAZETTEER_PATH = join(__dirname, '../..', 'data', 'places-gazetteer.json');
const STREETS_PATH = join(
  __dirname,
  '../..',
  'data',
  '04-ward-registers - Paramaribo Ward Registers 1828-1847',
  'Standardization of street names',
  'street standardization 20240328.csv',
);
const PLANTATIONS_DATASET_PATH = join(
  __dirname,
  '../..',
  'data',
  '01-plantages-dataset - Suriname Plantation Dataset Version 1.0',
  'Suriname Plantation Dataset Version 1.0.csv',
);

const OUTPUT_DIR = join(__dirname, '../..', 'data', 'nas-mediabank');
const OUTPUT_JSON = join(OUTPUT_DIR, 'nas-place-person-hits.json');
const OUTPUT_HIGH_JSON = join(OUTPUT_DIR, 'nas-place-person-hits.high-precision.json');

const BLOCKLIST_NORMALIZED = new Set([
  'suriname',
  'surinam',
  'nederland',
  'netherlands',
  'holland',
  'district',
  'divisie',
  'regering',
  'ministerie',
  'ministeries',
]);

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupe<T>(values: T[], keyFn: (value: T) => string): T[] {
  const map = new Map<string, T>();
  for (const value of values) {
    const key = keyFn(value);
    if (!map.has(key)) map.set(key, value);
  }
  return [...map.values()];
}

function readNasRows(): NasRow[] {
  return JSON.parse(readFileSync(NAS_PATH, 'utf8')) as NasRow[];
}

function readGazetteer(): GazetteerPlace[] {
  return JSON.parse(readFileSync(GAZETTEER_PATH, 'utf8')) as GazetteerPlace[];
}

function splitKeywords(value: string): string[] {
  return value
    .split(/[|,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function containsPhrase(haystackNormalized: string, needleNormalized: string): boolean {
  return ` ${haystackNormalized} `.includes(` ${needleNormalized} `);
}

function buildSnippet(text: string, term: string): string {
  const source = text || '';
  const idx = source.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return source.slice(0, 180);
  const start = Math.max(0, idx - 60);
  const end = Math.min(source.length, idx + term.length + 120);
  return source.slice(start, end).replace(/\s+/g, ' ').trim();
}

function buildStreetDictionary(): PlaceDictionaryEntry[] {
  const raw = readFileSync(STREETS_PATH, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ';',
  }) as Array<Record<string, string>>;

  const entries: PlaceDictionaryEntry[] = [];
  for (const row of rows) {
    const uniqueName = (row['unique streetname'] || '').trim();
    const standardized = (row['standardized streetname'] || '').trim();
    for (const rawName of [uniqueName, standardized]) {
      const normalized = normalize(rawName);
      if (!normalized || normalized.length < 4) continue;
      if (BLOCKLIST_NORMALIZED.has(normalized)) continue;
      entries.push({
        category: 'street',
        source: 'paramaribo-street-standardization',
        original: rawName,
        normalized,
        canonical: standardized || uniqueName,
        gazetteerId: '',
      });
    }
  }

  return entries;
}

function buildGazetteerDictionary(places: GazetteerPlace[]): PlaceDictionaryEntry[] {
  const out: PlaceDictionaryEntry[] = [];
  for (const place of places) {
    for (const name of place.names || []) {
      const text = (name.text || '').trim();
      const normalized = normalize(text);
      if (!normalized || normalized.length < 4) continue;
      if (BLOCKLIST_NORMALIZED.has(normalized)) continue;
      out.push({
        category: place.type,
        source: 'stm-gazetteer',
        original: text,
        normalized,
        canonical: text,
        gazetteerId: place.id,
      });
    }
  }
  return out;
}

function buildPlantationDatasetDictionary(): PlaceDictionaryEntry[] {
  const raw = readFileSync(PLANTATIONS_DATASET_PATH, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
  const entries: PlaceDictionaryEntry[] = [];
  for (const row of rows) {
    const text = (row['Name_plantation'] || '').trim();
    const normalized = normalize(text);
    if (!normalized || normalized.length < 4) continue;
    if (BLOCKLIST_NORMALIZED.has(normalized)) continue;
    entries.push({
      category: 'plantation',
      source: 'plantages-dataset',
      original: text,
      normalized,
      canonical: text,
      gazetteerId: '',
    });
  }
  return entries;
}

function buildPersonCandidatesFromField(personsRaw: string): string[] {
  return personsRaw
    .split(/[;,|]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 4)
    .filter((entry) => /[A-Za-z]/.test(entry));
}

function buildPersonCandidatesHeuristic(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,3}\b/g) || [];
  return matches.filter((entry) => {
    const n = normalize(entry);
    if (!n || n.length < 6) return false;
    if (BLOCKLIST_NORMALIZED.has(n)) return false;
    return true;
  });
}

function reviewBucketForPlace(ambiguityCount: number): HitRow['reviewBucket'] {
  if (ambiguityCount > 2) return 'ambiguous';
  if (ambiguityCount === 1) return 'high-precision';
  return 'needs-review';
}

function scan(nasRows: NasRow[], dictionary: PlaceDictionaryEntry[]): HitRow[] {
  const placeAmbiguity = new Map<string, number>();
  for (const entry of dictionary) {
    const key = `${entry.category}::${entry.normalized}`;
    placeAmbiguity.set(key, (placeAmbiguity.get(key) || 0) + 1);
  }

  const hits: HitRow[] = [];

  for (const row of nasRows) {
    const fields: Array<{ name: 'title' | 'description' | 'keywords'; value: string }> = [
      { name: 'title', value: row.title || '' },
      { name: 'description', value: row.description || '' },
      { name: 'keywords', value: splitKeywords(row.keywordsRaw || '').join(' | ') },
    ];

    for (const field of fields) {
      const norm = normalize(field.value);
      if (!norm) continue;

      for (const entry of dictionary) {
        if (!containsPhrase(norm, entry.normalized)) continue;
        const ambiguityCount = placeAmbiguity.get(`${entry.category}::${entry.normalized}`) || 1;
        const reviewBucket = reviewBucketForPlace(ambiguityCount);
        hits.push({
          recordKey: row.recordKey,
          detailId: row.detailId,
          mediaId: row.mediaId,
          mediaType: row.mediaType,
          inventoryNumber: row.inventoryNumber,
          yearRaw: row.yearRaw,
          field: field.name,
          hitType: 'place',
          category: entry.category,
          matchedTerm: entry.original,
          matchedTermNormalized: entry.normalized,
          canonicalName: entry.canonical,
          matchSource: entry.source,
          stmGazetteerId: entry.gazetteerId,
          ambiguityCount,
          title: row.title,
          snippet: buildSnippet(field.value, entry.original),
          lowHangingSpecific: ambiguityCount === 1,
          reviewBucket,
        });
      }
    }

    const explicitPersons = buildPersonCandidatesFromField(row.personsRaw || '');
    for (const person of explicitPersons) {
      const normalized = normalize(person);
      hits.push({
        recordKey: row.recordKey,
        detailId: row.detailId,
        mediaId: row.mediaId,
        mediaType: row.mediaType,
        inventoryNumber: row.inventoryNumber,
        yearRaw: row.yearRaw,
        field: 'personsRaw',
        hitType: 'person',
        category: 'person',
        matchedTerm: person,
        matchedTermNormalized: normalized,
        canonicalName: person,
        matchSource: 'nas-persons-field',
        stmGazetteerId: '',
        ambiguityCount: 1,
        title: row.title,
        snippet: person,
        lowHangingSpecific: true,
        reviewBucket: 'high-precision',
      });
    }

    const heuristicPersons = dedupe(
      [
        ...buildPersonCandidatesHeuristic(row.title || ''),
        ...buildPersonCandidatesHeuristic(row.description || ''),
        ...buildPersonCandidatesHeuristic(row.keywordsRaw || ''),
      ],
      (value) => normalize(value),
    ).filter((person) => !explicitPersons.some((entry) => normalize(entry) === normalize(person)));

    for (const person of heuristicPersons) {
      const normalized = normalize(person);
      hits.push({
        recordKey: row.recordKey,
        detailId: row.detailId,
        mediaId: row.mediaId,
        mediaType: row.mediaType,
        inventoryNumber: row.inventoryNumber,
        yearRaw: row.yearRaw,
        field: 'description',
        hitType: 'person',
        category: 'person',
        matchedTerm: person,
        matchedTermNormalized: normalized,
        canonicalName: person,
        matchSource: 'heuristic-capitalized-sequence',
        stmGazetteerId: '',
        ambiguityCount: 2,
        title: row.title,
        snippet: buildSnippet(`${row.title} ${row.description} ${row.keywordsRaw}`, person),
        lowHangingSpecific: false,
        reviewBucket: 'needs-review',
      });
    }
  }

  return dedupe(
    hits,
    (hit) =>
      [
        hit.recordKey,
        hit.field,
        hit.hitType,
        hit.matchSource,
        hit.matchedTermNormalized,
        hit.stmGazetteerId,
      ].join('::'),
  );
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const nasRows = readNasRows();
  const gazetteer = readGazetteer();
  const dictionary = dedupe(
    [
      ...buildStreetDictionary(),
      ...buildGazetteerDictionary(gazetteer),
      ...buildPlantationDatasetDictionary(),
    ],
    (entry) => `${entry.category}::${entry.source}::${entry.normalized}::${entry.gazetteerId}`,
  );

  const hits = scan(nasRows, dictionary);
  const highPrecision = hits.filter((hit) => hit.reviewBucket === 'high-precision');

  writeFileSync(OUTPUT_JSON, JSON.stringify(hits, null, 2), 'utf8');
  writeFileSync(OUTPUT_HIGH_JSON, JSON.stringify(highPrecision, null, 2), 'utf8');

  console.log(`Wrote ${hits.length} NAS place/person hits to:`);
  console.log(`- ${OUTPUT_JSON}`);
  console.log(`- ${OUTPUT_HIGH_JSON}`);
}

main();
