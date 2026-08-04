import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type GazetteerName = {
  text: string;
  language?: string | null;
  type?: string | null;
  isPreferred?: boolean;
};

type GazetteerPlace = {
  id: string;
  type: string;
  names: GazetteerName[];
  district?: string | null;
  locationDescription?: string | null;
};

type EuropeanaRow = {
  id: string;
  guid: string;
  type: string;
  title: string;
  descriptions: string;
  placeLabels: string;
  locationSignals: string;
  sourceInstitution: string;
  provider: string;
  surinameConfidence?: 'strict' | 'probable' | 'weak' | 'none';
  isStrictSuriname?: boolean;
  naturalHistoryFlag?: boolean;
};

type MatchCandidate = {
  europeanaId: string;
  europeanaGuid: string;
  europeanaType: string;
  matchedGazetteerId: string;
  matchedGazetteerType: string;
  matchedGazetteerName: string;
  matchedOnText: string;
  matchedBy: 'placeLabel' | 'locationSignal' | 'title';
  score: number;
  surinameConfidence: string;
  sourceInstitution: string;
  provider: string;
};

const EUROPEANA_PATH = join(
  __dirname,
  '../..',
  'data',
  'europeana',
  'suriname-av-image-linkable-metadata.json',
);
const GAZETTEER_PATH = join(__dirname, '../..', 'data', 'places-gazetteer.json');
const OUTPUT_DIR = join(__dirname, '../..', 'data', 'europeana');
const OUTPUT_JSON = join(OUTPUT_DIR, 'suriname-location-match-candidates.json');
const OUTPUT_CSV = join(OUTPUT_DIR, 'suriname-location-match-candidates.csv');
const OUTPUT_SUMMARY = join(OUTPUT_DIR, 'suriname-location-match-candidates-summary.md');
const OUTPUT_LOW_HANGING_JSON = join(
  OUTPUT_DIR,
  'suriname-location-match-candidates.low-hanging-fruit.json',
);
const OUTPUT_LOW_HANGING_CSV = join(
  OUTPUT_DIR,
  'suriname-location-match-candidates.low-hanging-fruit.csv',
);

const MATCH_SCOPE = process.env.EUROPEANA_MATCH_SCOPE || 'strict';
const GAZETTEER_TYPES = new Set(
  (process.env.EUROPEANA_GAZETTEER_TYPES || 'plantation,river,creek,district')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const GENERIC_LOCATION_TERMS = new Set([
  'suriname',
  'surinam',
  'republic of suriname',
  'republic of surinam',
  'dutch guiana',
  'kingdom of the netherlands',
  'netherlands',
  'holland',
  'time',
  'chronological period',
]);
const PLACE_HINT_WORDS = [
  'plantage',
  'plantation',
  'straat',
  'street',
  'weg',
  'laan',
  'district',
  'dorp',
  'village',
  'nederzetting',
  'settlement',
  'creek',
  'river',
  'rivier',
  'paramaribo',
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

function splitPipe(value: string): string[] {
  return value
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function shouldUseMatchText(value: string): boolean {
  const normalized = normalize(value);
  if (!normalized || normalized.length < 3) return false;
  if (GENERIC_LOCATION_TERMS.has(normalized)) return false;
  if (/^[0-9.\-\s]+$/.test(normalized)) return false;
  return true;
}

function splitPunctuation(value: string): string[] {
  return value
    .split(/[;:,()\[\]\/]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractSpecificPlacePhrases(row: EuropeanaRow): string[] {
  const raw = dedupe([
    ...splitPipe(row.title),
    ...splitPunctuation(row.title),
    ...splitPunctuation(row.descriptions),
  ]);

  return dedupe(
    raw.filter((entry) => {
      const normalized = normalize(entry);
      if (!normalized || normalized.length < 4) return false;
      if (GENERIC_LOCATION_TERMS.has(normalized)) return false;
      if (/^[0-9.\-\s]+$/.test(normalized)) return false;
      if (!PLACE_HINT_WORDS.some((token) => normalized.includes(token))) return false;
      return true;
    }),
  );
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function loadEuropeanaRows(): EuropeanaRow[] {
  return JSON.parse(readFileSync(EUROPEANA_PATH, 'utf8')) as EuropeanaRow[];
}

function loadGazetteerPlaces(): GazetteerPlace[] {
  return JSON.parse(readFileSync(GAZETTEER_PATH, 'utf8')) as GazetteerPlace[];
}

function buildGazetteerNameIndex(places: GazetteerPlace[]): Map<string, GazetteerPlace[]> {
  const index = new Map<string, GazetteerPlace[]>();

  for (const place of places) {
    if (!GAZETTEER_TYPES.has(place.type)) continue;

    const nameValues = place.names.map((name) => name.text);
    if (place.locationDescription) nameValues.push(place.locationDescription);
    if (place.district) nameValues.push(place.district);

    for (const value of nameValues) {
      const key = normalize(value);
      if (!key || key.length < 3) continue;
      const existing = index.get(key) || [];
      existing.push(place);
      index.set(key, existing);
    }
  }

  return index;
}

function addCandidates(
  out: MatchCandidate[],
  row: EuropeanaRow,
  texts: string[],
  matchedBy: MatchCandidate['matchedBy'],
  score: number,
  index: Map<string, GazetteerPlace[]>,
) {
  for (const text of texts) {
    if (!shouldUseMatchText(text)) continue;
    const key = normalize(text);
    if (!key || key.length < 3) continue;

    const places = index.get(key) || [];
    for (const place of places) {
      const primaryName = place.names.find((name) => name.isPreferred)?.text || place.names[0]?.text || '';
      out.push({
        europeanaId: row.id,
        europeanaGuid: row.guid,
        europeanaType: row.type,
        matchedGazetteerId: place.id,
        matchedGazetteerType: place.type,
        matchedGazetteerName: primaryName,
        matchedOnText: text,
        matchedBy,
        score,
        surinameConfidence: row.surinameConfidence || 'unknown',
        sourceInstitution: row.sourceInstitution,
        provider: row.provider,
      });
    }
  }
}

function dedupeCandidates(candidates: MatchCandidate[]): MatchCandidate[] {
  const bestByKey = new Map<string, MatchCandidate>();

  for (const candidate of candidates) {
    const key = `${candidate.europeanaId}::${candidate.matchedGazetteerId}`;
    const existing = bestByKey.get(key);
    if (!existing || candidate.score > existing.score) {
      bestByKey.set(key, candidate);
    }
  }

  return [...bestByKey.values()].sort((a, b) => b.score - a.score);
}

function selectLowHangingCandidates(candidates: MatchCandidate[]): MatchCandidate[] {
  return candidates
    .filter((candidate) => candidate.score >= 0.95)
    .sort((a, b) => b.score - a.score);
}

function toCsv(rows: MatchCandidate[]): string {
  const headers: Array<keyof MatchCandidate> = [
    'europeanaId',
    'europeanaGuid',
    'europeanaType',
    'matchedGazetteerId',
    'matchedGazetteerType',
    'matchedGazetteerName',
    'matchedOnText',
    'matchedBy',
    'score',
    'surinameConfidence',
    'sourceInstitution',
    'provider',
  ];

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(String(row[header]))).join(','));
  }
  return lines.join('\n');
}

function buildSummary(
  processedRows: number,
  candidates: MatchCandidate[],
  gazetteerPlacesConsidered: number,
): string {
  const byMethod = new Map<string, number>();
  const byType = new Map<string, number>();
  const uniqueEuropeanaIds = new Set<string>();

  for (const candidate of candidates) {
    uniqueEuropeanaIds.add(candidate.europeanaId);
    byMethod.set(candidate.matchedBy, (byMethod.get(candidate.matchedBy) || 0) + 1);
    byType.set(candidate.matchedGazetteerType, (byType.get(candidate.matchedGazetteerType) || 0) + 1);
  }

  return [
    '# Europeana -> STM Gazetteer Match Candidates',
    '',
    `- Match scope: ${MATCH_SCOPE}`,
    `- Gazetteer types included: ${[...GAZETTEER_TYPES].join(', ')}`,
    `- Gazetteer places considered: ${gazetteerPlacesConsidered}`,
    `- Europeana rows processed: ${processedRows}`,
    `- Candidate links: ${candidates.length}`,
    `- Europeana records with at least one candidate: ${uniqueEuropeanaIds.size}`,
    '',
    '## By match method',
    ...[...byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([method, count]) => `- ${method}: ${count}`),
    '',
    '## By gazetteer place type',
    ...[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => `- ${type}: ${count}`),
    '',
    '## Notes',
    '- This first pass uses exact normalized name matches only.',
    '- Fuzzy matching and contextual disambiguation are planned next.',
  ].join('\n');
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const rows = loadEuropeanaRows();
  const places = loadGazetteerPlaces();
  const index = buildGazetteerNameIndex(places);

  const rowsInScope = rows.filter((row) => {
    if (MATCH_SCOPE === 'all') return true;
    return row.isStrictSuriname === true;
  });

  const candidates: MatchCandidate[] = [];
  for (const row of rowsInScope) {
    if (row.naturalHistoryFlag) continue;

    addCandidates(candidates, row, splitPipe(row.placeLabels), 'placeLabel', 1.0, index);
    addCandidates(candidates, row, splitPipe(row.locationSignals), 'locationSignal', 0.9, index);
    addCandidates(candidates, row, splitPipe(row.title), 'title', 0.8, index);
    addCandidates(candidates, row, extractSpecificPlacePhrases(row), 'title', 0.95, index);
  }

  const deduped = dedupeCandidates(candidates);
  const lowHanging = selectLowHangingCandidates(deduped);
  const gazetteerPlacesConsidered = places.filter((place) => GAZETTEER_TYPES.has(place.type)).length;

  writeFileSync(OUTPUT_JSON, JSON.stringify(deduped, null, 2), 'utf8');
  writeFileSync(OUTPUT_CSV, toCsv(deduped), 'utf8');
  writeFileSync(OUTPUT_LOW_HANGING_JSON, JSON.stringify(lowHanging, null, 2), 'utf8');
  writeFileSync(OUTPUT_LOW_HANGING_CSV, toCsv(lowHanging), 'utf8');
  writeFileSync(
    OUTPUT_SUMMARY,
    buildSummary(rowsInScope.length, deduped, gazetteerPlacesConsidered),
    'utf8',
  );

  console.log(`Wrote ${deduped.length} location candidates to:`);
  console.log(`- ${OUTPUT_JSON}`);
  console.log(`- ${OUTPUT_CSV}`);
  console.log(`- ${OUTPUT_LOW_HANGING_JSON}`);
  console.log(`- ${OUTPUT_LOW_HANGING_CSV}`);
  console.log(`- ${OUTPUT_SUMMARY}`);
}

main();