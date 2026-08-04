import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

type EuropeanaRow = {
  id: string;
  guid: string;
  type: string;
  title: string;
  descriptions: string;
  surinameConfidence?: string;
  isStrictSuriname?: boolean;
  naturalHistoryFlag?: boolean;
};

type GazetteerPlace = {
  id: string;
  type: string;
  names: Array<{ text: string; isPreferred?: boolean }>;
};

type NameDictionaryEntry = {
  category: 'street' | 'plantation';
  source: 'paramaribo-street-standardization' | 'stm-gazetteer' | 'plantages-dataset';
  original: string;
  normalized: string;
  canonical: string;
  gazetteerId?: string;
};

type HitRow = {
  europeanaId: string;
  europeanaGuid: string;
  europeanaType: string;
  field: 'title' | 'description';
  category: 'street' | 'plantation';
  matchedTerm: string;
  matchedTermNormalized: string;
  canonicalName: string;
  matchSource: string;
  stmGazetteerId: string;
  termAmbiguityCount: number;
  surinameConfidence: string;
  isStrictSuriname: boolean;
  naturalHistoryFlag: boolean;
  title: string;
  snippet: string;
  plantationContextHint: boolean;
  streetContextHint: boolean;
  lowHangingSpecific: boolean;
  reviewBucket: 'high-precision' | 'needs-review' | 'ambiguous';
};

const EUROPEANA_PATH = join(
  __dirname,
  '../..',
  'data',
  'europeana',
  'suriname-av-image-linkable-metadata.json',
);
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
const OUTPUT_DIR = join(__dirname, '../..', 'data', 'europeana');
const OUTPUT_JSON = join(OUTPUT_DIR, 'suriname-title-description-place-name-hits.json');
const OUTPUT_CSV = join(OUTPUT_DIR, 'suriname-title-description-place-name-hits.csv');
const OUTPUT_SUMMARY = join(OUTPUT_DIR, 'suriname-title-description-place-name-hits-summary.md');
const OUTPUT_LOW_HANGING_JSON = join(
  OUTPUT_DIR,
  'suriname-title-description-place-name-hits.low-hanging-specific.json',
);
const OUTPUT_LOW_HANGING_CSV = join(
  OUTPUT_DIR,
  'suriname-title-description-place-name-hits.low-hanging-specific.csv',
);

const SCAN_SCOPE = process.env.EUROPEANA_SCAN_SCOPE || 'strict';
const EXCLUDE_NATURAL_HISTORY = process.env.EUROPEANA_SCAN_EXCLUDE_NATURAL_HISTORY !== 'false';

const BLOCKLIST_NORMALIZED = new Set([
  'suriname',
  'surinam',
  'paramaribo',
  'amsterdam',
  'rotterdam',
  'nederland',
  'netherlands',
]);
const STREET_CONTEXT_WORDS = [
  'straat',
  'street',
  'weg',
  'laan',
  'gracht',
  'plein',
  'waterkant',
  'hoek',
  'corner',
  'adres',
  'address',
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function splitPipe(value: string): string[] {
  return value
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readEuropeanaRows(): EuropeanaRow[] {
  return JSON.parse(readFileSync(EUROPEANA_PATH, 'utf8')) as EuropeanaRow[];
}

function readGazetteer(): GazetteerPlace[] {
  return JSON.parse(readFileSync(GAZETTEER_PATH, 'utf8')) as GazetteerPlace[];
}

function buildStreetDictionary(): NameDictionaryEntry[] {
  const raw = readFileSync(STREETS_PATH, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ';',
  }) as Array<Record<string, string>>;

  const entries: NameDictionaryEntry[] = [];
  for (const row of rows) {
    const uniqueName = (row['unique streetname'] || '').trim();
    const standardized = (row['standardized streetname'] || '').trim();
    for (const name of [uniqueName, standardized]) {
      const normalized = normalize(name);
      if (!normalized || normalized.length < 4) continue;
      if (BLOCKLIST_NORMALIZED.has(normalized)) continue;
      entries.push({
        category: 'street',
        source: 'paramaribo-street-standardization',
        original: name,
        normalized,
        canonical: standardized || uniqueName,
      });
    }
  }

  return entries;
}

function buildPlantationDictionary(gazetteer: GazetteerPlace[]): NameDictionaryEntry[] {
  const entries: NameDictionaryEntry[] = [];

  for (const place of gazetteer) {
    if (place.type !== 'plantation') continue;
    for (const name of place.names || []) {
      const text = (name.text || '').trim();
      const normalized = normalize(text);
      if (!normalized || normalized.length < 4) continue;
      if (BLOCKLIST_NORMALIZED.has(normalized)) continue;
      entries.push({
        category: 'plantation',
        source: 'stm-gazetteer',
        original: text,
        normalized,
        canonical: text,
        gazetteerId: place.id,
      });
    }
  }

  const raw = readFileSync(PLANTATIONS_DATASET_PATH, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
  }) as Array<Record<string, string>>;
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
    });
  }

  return entries;
}

function dedupeDictionary(entries: NameDictionaryEntry[]): NameDictionaryEntry[] {
  const byKey = new Map<string, NameDictionaryEntry>();
  for (const entry of entries) {
    const key = `${entry.category}::${entry.normalized}::${entry.canonical}::${entry.gazetteerId || ''}`;
    if (!byKey.has(key)) byKey.set(key, entry);
  }
  return [...byKey.values()];
}

function buildAmbiguityMap(entries: NameDictionaryEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.category}::${entry.normalized}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function containsPhrase(normalizedHaystack: string, normalizedNeedle: string): boolean {
  const hay = ` ${normalizedHaystack} `;
  const needle = ` ${normalizedNeedle} `;
  return hay.includes(needle);
}

function hasPlantationContext(normalizedText: string, termNormalized: string): boolean {
  const phrases = [
    `plantage ${termNormalized}`,
    `${termNormalized} plantage`,
    `plantation ${termNormalized}`,
    `${termNormalized} plantation`,
    `post ${termNormalized}`,
    `station ${termNormalized}`,
    `usine ${termNormalized}`,
  ];
  return phrases.some((phrase) => containsPhrase(normalizedText, phrase));
}

function hasStreetContext(normalizedText: string, termNormalized: string): boolean {
  if (STREET_CONTEXT_WORDS.some((word) => termNormalized.includes(word))) return true;
  const phrases = [
    `straat ${termNormalized}`,
    `${termNormalized} straat`,
    `street ${termNormalized}`,
    `${termNormalized} street`,
    `aan de ${termNormalized}`,
    `op de ${termNormalized}`,
    `naar de ${termNormalized}`,
    `waterkant`,
  ];
  return phrases.some((phrase) => containsPhrase(normalizedText, phrase));
}

function getReviewBucket(
  category: HitRow['category'],
  ambiguity: number,
  plantationContextHint: boolean,
  streetContextHint: boolean,
): HitRow['reviewBucket'] {
  if (ambiguity > 2) return 'ambiguous';
  if (category === 'street') {
    return streetContextHint ? 'high-precision' : 'needs-review';
  }
  return plantationContextHint ? 'high-precision' : 'needs-review';
}

function isLowHangingSpecific(
  category: HitRow['category'],
  ambiguity: number,
  plantationContextHint: boolean,
  streetContextHint: boolean,
): boolean {
  if (ambiguity > 2) return false;
  if (category === 'street') return streetContextHint;
  return plantationContextHint;
}

function buildSnippet(text: string, term: string): string {
  const source = text || '';
  const idx = source.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return source.slice(0, 180);
  const start = Math.max(0, idx - 50);
  const end = Math.min(source.length, idx + term.length + 100);
  return source.slice(start, end).replace(/\s+/g, ' ').trim();
}

function scanRows(rows: EuropeanaRow[], dictionary: NameDictionaryEntry[]): HitRow[] {
  const ambiguity = buildAmbiguityMap(dictionary);
  const hits: HitRow[] = [];

  for (const row of rows) {
    if (SCAN_SCOPE === 'strict' && row.isStrictSuriname !== true) continue;
    if (EXCLUDE_NATURAL_HISTORY && row.naturalHistoryFlag) continue;

    const titleParts = splitPipe(row.title || '');
    const descriptionParts = splitPipe(row.descriptions || '');
    const titleNorm = normalize(titleParts.join(' '));
    const descNorm = normalize(descriptionParts.join(' '));

    for (const entry of dictionary) {
      if (containsPhrase(titleNorm, entry.normalized)) {
        const termAmbiguityCount = ambiguity.get(`${entry.category}::${entry.normalized}`) || 1;
        const plantationContextHint =
          entry.category === 'plantation' ? hasPlantationContext(titleNorm, entry.normalized) : false;
        const streetContextHint =
          entry.category === 'street' ? hasStreetContext(titleNorm, entry.normalized) : false;
        hits.push({
          europeanaId: row.id,
          europeanaGuid: row.guid,
          europeanaType: row.type,
          field: 'title',
          category: entry.category,
          matchedTerm: entry.original,
          matchedTermNormalized: entry.normalized,
          canonicalName: entry.canonical,
          matchSource: entry.source,
          stmGazetteerId: entry.gazetteerId || '',
          termAmbiguityCount,
          surinameConfidence: row.surinameConfidence || 'unknown',
          isStrictSuriname: row.isStrictSuriname === true,
          naturalHistoryFlag: row.naturalHistoryFlag === true,
          title: row.title,
          snippet: buildSnippet(row.title, entry.original),
          plantationContextHint,
          streetContextHint,
          lowHangingSpecific: isLowHangingSpecific(
            entry.category,
            termAmbiguityCount,
            plantationContextHint,
            streetContextHint,
          ),
          reviewBucket: getReviewBucket(
            entry.category,
            termAmbiguityCount,
            plantationContextHint,
            streetContextHint,
          ),
        });
      }

      if (containsPhrase(descNorm, entry.normalized)) {
        const termAmbiguityCount = ambiguity.get(`${entry.category}::${entry.normalized}`) || 1;
        const plantationContextHint =
          entry.category === 'plantation' ? hasPlantationContext(descNorm, entry.normalized) : false;
        const streetContextHint =
          entry.category === 'street' ? hasStreetContext(descNorm, entry.normalized) : false;
        hits.push({
          europeanaId: row.id,
          europeanaGuid: row.guid,
          europeanaType: row.type,
          field: 'description',
          category: entry.category,
          matchedTerm: entry.original,
          matchedTermNormalized: entry.normalized,
          canonicalName: entry.canonical,
          matchSource: entry.source,
          stmGazetteerId: entry.gazetteerId || '',
          termAmbiguityCount,
          surinameConfidence: row.surinameConfidence || 'unknown',
          isStrictSuriname: row.isStrictSuriname === true,
          naturalHistoryFlag: row.naturalHistoryFlag === true,
          title: row.title,
          snippet: buildSnippet(row.descriptions, entry.original),
          plantationContextHint,
          streetContextHint,
          lowHangingSpecific: isLowHangingSpecific(
            entry.category,
            termAmbiguityCount,
            plantationContextHint,
            streetContextHint,
          ),
          reviewBucket: getReviewBucket(
            entry.category,
            termAmbiguityCount,
            plantationContextHint,
            streetContextHint,
          ),
        });
      }
    }
  }

  const dedupe = new Map<string, HitRow>();
  for (const hit of hits) {
    const key = [
      hit.europeanaId,
      hit.field,
      hit.category,
      hit.matchedTermNormalized,
      hit.stmGazetteerId,
    ].join('::');
    if (!dedupe.has(key)) dedupe.set(key, hit);
  }
  return [...dedupe.values()];
}

function toCsv(rows: HitRow[]): string {
  const headers: Array<keyof HitRow> = [
    'europeanaId',
    'europeanaGuid',
    'europeanaType',
    'field',
    'category',
    'matchedTerm',
    'matchedTermNormalized',
    'canonicalName',
    'matchSource',
    'stmGazetteerId',
    'termAmbiguityCount',
    'surinameConfidence',
    'isStrictSuriname',
    'naturalHistoryFlag',
    'title',
    'snippet',
    'plantationContextHint',
    'streetContextHint',
    'lowHangingSpecific',
    'reviewBucket',
  ];

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(String(row[header]))).join(','));
  }
  return lines.join('\n');
}

function buildSummary(
  scopedRows: number,
  hits: HitRow[],
  streetTerms: number,
  plantationTerms: number,
): string {
  const byCategory = new Map<string, number>();
  const byField = new Map<string, number>();
  const byReviewBucket = new Map<string, number>();
  const recordIds = new Set<string>();
  const specificHits = hits.filter((hit) => hit.termAmbiguityCount <= 2).length;
  const lowHangingSpecific = hits.filter((hit) => hit.lowHangingSpecific).length;

  for (const hit of hits) {
    recordIds.add(hit.europeanaId);
    byCategory.set(hit.category, (byCategory.get(hit.category) || 0) + 1);
    byField.set(hit.field, (byField.get(hit.field) || 0) + 1);
    byReviewBucket.set(hit.reviewBucket, (byReviewBucket.get(hit.reviewBucket) || 0) + 1);
  }

  return [
    '# Europeana Title/Description Name Scan (STM dictionaries)',
    '',
    `- Scan scope: ${SCAN_SCOPE}`,
    `- Exclude natural history flagged records: ${EXCLUDE_NATURAL_HISTORY ? 'yes' : 'no'}`,
    `- Europeana rows scanned: ${scopedRows}`,
    `- Street dictionary size: ${streetTerms}`,
    `- Plantation dictionary size: ${plantationTerms}`,
    `- Hit rows: ${hits.length}`,
    `- Europeana records with hits: ${recordIds.size}`,
    `- Low-ambiguity hits (termAmbiguityCount <= 2): ${specificHits}`,
    `- Low-hanging specific hits: ${lowHangingSpecific}`,
    '',
    '## Hits by category',
    ...[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Hits by field',
    ...[...byField.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Hits by review bucket',
    ...[...byReviewBucket.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Notes',
    '- This scan uses exact normalized phrase matching only.',
    '- Use termAmbiguityCount to prioritize specific place references first.',
  ].join('\n');
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const rows = readEuropeanaRows();
  const gazetteer = readGazetteer();
  const streetDictionary = dedupeDictionary(buildStreetDictionary());
  const plantationDictionary = dedupeDictionary(buildPlantationDictionary(gazetteer));
  const dictionary = [...streetDictionary, ...plantationDictionary];

  const rowsInScope = rows.filter((row) => {
    if (SCAN_SCOPE === 'all') return true;
    return row.isStrictSuriname === true;
  });

  const hits = scanRows(rowsInScope, dictionary);
  const lowHanging = hits.filter((hit) => hit.lowHangingSpecific);

  writeFileSync(OUTPUT_JSON, JSON.stringify(hits, null, 2), 'utf8');
  writeFileSync(OUTPUT_CSV, toCsv(hits), 'utf8');
  writeFileSync(OUTPUT_LOW_HANGING_JSON, JSON.stringify(lowHanging, null, 2), 'utf8');
  writeFileSync(OUTPUT_LOW_HANGING_CSV, toCsv(lowHanging), 'utf8');
  writeFileSync(
    OUTPUT_SUMMARY,
    buildSummary(rowsInScope.length, hits, streetDictionary.length, plantationDictionary.length),
    'utf8',
  );

  console.log(`Wrote ${hits.length} title/description hits to:`);
  console.log(`- ${OUTPUT_JSON}`);
  console.log(`- ${OUTPUT_CSV}`);
  console.log(`- ${OUTPUT_LOW_HANGING_JSON}`);
  console.log(`- ${OUTPUT_LOW_HANGING_CSV}`);
  console.log(`- ${OUTPUT_SUMMARY}`);
}

main();