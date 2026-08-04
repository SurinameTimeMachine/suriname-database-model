import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type EuropeanaRow = {
  id: string;
  guid: string;
  apiRecord: string;
  type: string;
  title: string;
  descriptions: string;
  sourceInstitution: string;
  provider: string;
  sourceLandingPage: string;
  previewUri: string;
  imageOrAvUri: string;
  rights: string;
  country: string;
  year: string;
  surinameConfidence: 'strict' | 'probable' | 'weak' | 'none' | string;
  isStrictSuriname: boolean;
  naturalHistoryFlag: boolean;
  naturalHistorySignals: string;
};

type MatchCandidate = {
  europeanaId: string;
  matchedGazetteerId: string;
  matchedGazetteerType: string;
  matchedGazetteerName: string;
  matchedOnText: string;
  matchedBy: 'placeLabel' | 'locationSignal' | 'title';
  score: number;
};

type HitRow = {
  europeanaId: string;
  field: 'title' | 'description';
  category: 'street' | 'plantation';
  matchedTerm: string;
  canonicalName: string;
  matchSource: string;
  stmGazetteerId: string;
  termAmbiguityCount: number;
  lowHangingSpecific: boolean;
  reviewBucket: 'high-precision' | 'needs-review' | 'ambiguous';
};

type ReviewRow = {
  europeanaId: string;
  europeanaGuid: string;
  europeanaType: string;
  title: string;
  description: string;
  sourceInstitution: string;
  provider: string;
  apiRecord: string;
  sourceLandingPage: string;
  previewUri: string;
  imageOrAvUri: string;
  rights: string;
  country: string;
  year: string;
  surinameConfidence: string;
  isStrictSuriname: boolean;
  naturalHistoryFlag: boolean;
  naturalHistorySignals: string;
  locationCandidateCount: number;
  textHitCount: number;
  lowHangingSpecificHitCount: number;
  highPrecisionHitCount: number;
  needsReviewHitCount: number;
  ambiguousHitCount: number;
  locationCandidatesTop: string;
  textHitsHighPrecisionTop: string;
  textHitsNeedsReviewTop: string;
  textHitsAmbiguousTop: string;
  reviewerDecision: string;
  chosenGazetteerId: string;
  chosenPlaceName: string;
  reviewNotes: string;
};

const OUTPUT_DIR = join(__dirname, '../..', 'data', 'europeana');
const EUROPEANA_PATH = join(OUTPUT_DIR, 'suriname-av-image-linkable-metadata.json');
const MATCHES_PATH = join(OUTPUT_DIR, 'suriname-location-match-candidates.json');
const HITS_PATH = join(OUTPUT_DIR, 'suriname-title-description-place-name-hits.json');

const OUTPUT_JSON = join(OUTPUT_DIR, 'suriname-review-form.grouped.json');
const OUTPUT_CSV = join(OUTPUT_DIR, 'suriname-review-form.grouped.csv');
const OUTPUT_SUMMARY = join(OUTPUT_DIR, 'suriname-review-form.grouped-summary.md');

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function splitPipe(value: string): string[] {
  return (value || '')
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dedupe<T>(items: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function formatLocationCandidate(candidate: MatchCandidate): string {
  return [
    candidate.matchedGazetteerId,
    candidate.matchedGazetteerName,
    candidate.matchedGazetteerType,
    candidate.matchedBy,
    candidate.score.toFixed(2),
    candidate.matchedOnText,
  ].join(' || ');
}

function formatTextHit(hit: HitRow): string {
  return [
    hit.stmGazetteerId || '(none)',
    hit.canonicalName,
    hit.category,
    hit.field,
    hit.termAmbiguityCount,
    hit.matchSource,
    hit.matchedTerm,
  ].join(' || ');
}

function limitTop(values: string[], max = 5): string {
  return values.slice(0, max).join(' | ');
}

function toCsv(rows: ReviewRow[]): string {
  const headers: Array<keyof ReviewRow> = [
    'europeanaId',
    'europeanaGuid',
    'europeanaType',
    'title',
    'description',
    'sourceInstitution',
    'provider',
    'apiRecord',
    'sourceLandingPage',
    'previewUri',
    'imageOrAvUri',
    'rights',
    'country',
    'year',
    'surinameConfidence',
    'isStrictSuriname',
    'naturalHistoryFlag',
    'naturalHistorySignals',
    'locationCandidateCount',
    'textHitCount',
    'lowHangingSpecificHitCount',
    'highPrecisionHitCount',
    'needsReviewHitCount',
    'ambiguousHitCount',
    'locationCandidatesTop',
    'textHitsHighPrecisionTop',
    'textHitsNeedsReviewTop',
    'textHitsAmbiguousTop',
    'reviewerDecision',
    'chosenGazetteerId',
    'chosenPlaceName',
    'reviewNotes',
  ];

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(String(row[header]))).join(','));
  }
  return lines.join('\n');
}

function buildSummary(rows: ReviewRow[]): string {
  const withLocationCandidates = rows.filter((row) => row.locationCandidateCount > 0).length;
  const withTextHits = rows.filter((row) => row.textHitCount > 0).length;
  const lowHanging = rows.filter((row) => row.lowHangingSpecificHitCount > 0).length;
  const highPrecision = rows.filter((row) => row.highPrecisionHitCount > 0).length;
  const naturalHistory = rows.filter((row) => row.naturalHistoryFlag).length;

  const byConfidence = new Map<string, number>();
  for (const row of rows) {
    byConfidence.set(row.surinameConfidence, (byConfidence.get(row.surinameConfidence) || 0) + 1);
  }

  return [
    '# Europeana Grouped Review Form Summary',
    '',
    `- Total Europeana records: ${rows.length}`,
    `- Records with location candidates: ${withLocationCandidates}`,
    `- Records with title/description hits: ${withTextHits}`,
    `- Records with low-hanging specific hits: ${lowHanging}`,
    `- Records with high-precision hits: ${highPrecision}`,
    `- Natural history flagged records: ${naturalHistory}`,
    '',
    '## By Suriname confidence',
    ...[...byConfidence.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Notes',
    '- Each row is one Europeana record with grouped candidate fields.',
    '- Reviewer fields are included at the end of the CSV for manual decisions.',
  ].join('\n');
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const europeanaRows = JSON.parse(readFileSync(EUROPEANA_PATH, 'utf8')) as EuropeanaRow[];
  const locationCandidates = JSON.parse(readFileSync(MATCHES_PATH, 'utf8')) as MatchCandidate[];
  const textHits = JSON.parse(readFileSync(HITS_PATH, 'utf8')) as HitRow[];

  const candidatesByRecord = new Map<string, MatchCandidate[]>();
  for (const candidate of locationCandidates) {
    const existing = candidatesByRecord.get(candidate.europeanaId) || [];
    existing.push(candidate);
    candidatesByRecord.set(candidate.europeanaId, existing);
  }

  const hitsByRecord = new Map<string, HitRow[]>();
  for (const hit of textHits) {
    const existing = hitsByRecord.get(hit.europeanaId) || [];
    existing.push(hit);
    hitsByRecord.set(hit.europeanaId, existing);
  }

  const reviewRows: ReviewRow[] = europeanaRows.map((row) => {
    const candidates = dedupe(
      [...(candidatesByRecord.get(row.id) || [])].sort((a, b) => b.score - a.score),
      (candidate) => `${candidate.matchedGazetteerId}::${candidate.matchedBy}::${candidate.matchedOnText}`,
    );

    const hits = dedupe(
      hitsByRecord.get(row.id) || [],
      (hit) => [hit.field, hit.category, hit.matchSource, hit.matchedTerm, hit.stmGazetteerId].join('::'),
    );

    const highPrecisionHits = hits.filter((hit) => hit.reviewBucket === 'high-precision');
    const needsReviewHits = hits.filter((hit) => hit.reviewBucket === 'needs-review');
    const ambiguousHits = hits.filter((hit) => hit.reviewBucket === 'ambiguous');
    const lowHangingHits = hits.filter((hit) => hit.lowHangingSpecific);

    return {
      europeanaId: row.id,
      europeanaGuid: row.guid,
      europeanaType: row.type,
      title: splitPipe(row.title)[0] || row.title || '',
      description: splitPipe(row.descriptions)[0] || row.descriptions || '',
      sourceInstitution: row.sourceInstitution || '',
      provider: row.provider || '',
      apiRecord: row.apiRecord || '',
      sourceLandingPage: row.sourceLandingPage || '',
      previewUri: row.previewUri || '',
      imageOrAvUri: row.imageOrAvUri || '',
      rights: row.rights || '',
      country: row.country || '',
      year: row.year || '',
      surinameConfidence: row.surinameConfidence || 'unknown',
      isStrictSuriname: row.isStrictSuriname === true,
      naturalHistoryFlag: row.naturalHistoryFlag === true,
      naturalHistorySignals: row.naturalHistorySignals || '',
      locationCandidateCount: candidates.length,
      textHitCount: hits.length,
      lowHangingSpecificHitCount: lowHangingHits.length,
      highPrecisionHitCount: highPrecisionHits.length,
      needsReviewHitCount: needsReviewHits.length,
      ambiguousHitCount: ambiguousHits.length,
      locationCandidatesTop: limitTop(candidates.map(formatLocationCandidate)),
      textHitsHighPrecisionTop: limitTop(highPrecisionHits.map(formatTextHit)),
      textHitsNeedsReviewTop: limitTop(needsReviewHits.map(formatTextHit)),
      textHitsAmbiguousTop: limitTop(ambiguousHits.map(formatTextHit)),
      reviewerDecision: '',
      chosenGazetteerId: '',
      chosenPlaceName: '',
      reviewNotes: '',
    };
  });

  reviewRows.sort((a, b) => {
    const aSignal = a.highPrecisionHitCount + a.lowHangingSpecificHitCount + a.locationCandidateCount;
    const bSignal = b.highPrecisionHitCount + b.lowHangingSpecificHitCount + b.locationCandidateCount;
    if (bSignal !== aSignal) return bSignal - aSignal;
    return a.europeanaId.localeCompare(b.europeanaId);
  });

  writeFileSync(OUTPUT_JSON, JSON.stringify(reviewRows, null, 2), 'utf8');
  writeFileSync(OUTPUT_CSV, toCsv(reviewRows), 'utf8');
  writeFileSync(OUTPUT_SUMMARY, buildSummary(reviewRows), 'utf8');

  console.log(`Wrote ${reviewRows.length} grouped review rows to:`);
  console.log(`- ${OUTPUT_JSON}`);
  console.log(`- ${OUTPUT_CSV}`);
  console.log(`- ${OUTPUT_SUMMARY}`);
}

main();