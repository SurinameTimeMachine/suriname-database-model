import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

type UnknownRecord = Record<string, unknown>;

type EuropeanaSearchItem = {
  id?: string;
  type?: string;
  title?: string[];
  dcDescription?: string[];
  dcCreator?: string[];
  dcContributor?: string[];
  dcSubject?: string[];
  dcCoverage?: string[];
  edmAgent?: string[];
  edmAgentLabel?: Array<{ def?: string }>;
  edmIsShownBy?: string[];
  edmIsShownAt?: string[];
  edmPreview?: string[];
  edmPlace?: string[];
  edmPlaceLabel?: Array<{ def?: string }>;
  edmPlaceLatitude?: string[];
  edmPlaceLongitude?: string[];
  provider?: string[];
  dataProvider?: string[];
  country?: string[];
  rights?: string[];
  guid?: string;
  link?: string;
  year?: string[];
  [key: string]: unknown;
};

type EuropeanaSearchResponse = {
  success: boolean;
  totalResults: number;
  itemsCount: number;
  nextCursor?: string;
  items?: EuropeanaSearchItem[];
};

type ExportRow = {
  id: string;
  guid: string;
  apiRecord: string;
  type: string;
  title: string;
  descriptions: string;
  creators: string;
  contributors: string;
  personNames: string;
  placeLabels: string;
  placeUris: string;
  placeLatitudes: string;
  placeLongitudes: string;
  locationSignals: string;
  personSignals: string;
  hasLocationSignal: boolean;
  hasPersonSignal: boolean;
  sourceInstitution: string;
  provider: string;
  imageOrAvUri: string;
  sourceLandingPage: string;
  previewUri: string;
  rights: string;
  country: string;
  year: string;
  hasSurinamePlaceUri: boolean;
  hasSurinameCoordinate: boolean;
  hasSurinameLabelToken: boolean;
  hasNonSurinamePrimarySignal: boolean;
  surinameConfidence: 'strict' | 'probable' | 'weak' | 'none';
  isStrictSuriname: boolean;
  naturalHistoryByInstitution: boolean;
  naturalHistoryByContent: boolean;
  naturalHistoryFlag: boolean;
  naturalHistorySignals: string;
};

const OUTPUT_DIR = join(__dirname, '../..', 'data', 'europeana');
const OUTPUT_JSON = join(OUTPUT_DIR, 'suriname-av-image-linkable-metadata.json');
const OUTPUT_CSV = join(OUTPUT_DIR, 'suriname-av-image-linkable-metadata.csv');
const OUTPUT_STRICT_JSON = join(
  OUTPUT_DIR,
  'suriname-av-image-linkable-metadata.strict-suriname.json',
);
const OUTPUT_STRICT_CSV = join(
  OUTPUT_DIR,
  'suriname-av-image-linkable-metadata.strict-suriname.csv',
);
const OUTPUT_SUMMARY = join(OUTPUT_DIR, 'suriname-av-image-linkable-summary.md');

const API_KEY = process.env.EUROPEANA_API_KEY || 'apidemo';
const QUERY = process.env.EUROPEANA_QUERY || 'suriname';
const PROFILE = process.env.EUROPEANA_PROFILE || 'rich';
const REUSABILITY = process.env.EUROPEANA_REUSABILITY || '';
const PAGINATION_MODE = process.env.EUROPEANA_PAGINATION_MODE || 'cursor';
const ROWS = 100;
const MAX_RECORDS = Number(process.env.EUROPEANA_MAX_RECORDS || '0');
const REQUIRE_LINKABLE = process.env.EUROPEANA_REQUIRE_LINKABLE !== 'false';
const SURINAME_PLACE_URI_MARKERS = ['http://data.europeana.eu/place/216309'];
const SURINAME_TOKENS = [
  'suriname',
  'surinam',
  'paramaribo',
  'commewijne',
  'cottica',
  'nickerie',
  'coronie',
  'saramacca',
  'marowijne',
  'brokopondo',
];
const NON_SURINAME_TOKENS = [
  'nederland',
  'netherlands',
  'holland',
  'amsterdam',
  'belgium',
  'belgie',
  'italy',
  'france',
  'united kingdom',
  'london',
  'germany',
  'berlin',
];
const NATURAL_HISTORY_INSTITUTION_TOKENS = [
  'naturalis',
  'biodiversity',
  'xeno-canto',
  'natural history museum',
  'museum fur naturkunde',
  'herbarium',
  'botanic',
  'zoological',
];
const NATURAL_HISTORY_CONTENT_TOKENS = [
  'species',
  'specimen',
  'taxonomy',
  'taxon',
  'biodiversity',
  'bird',
  'frog',
  'mammal',
  'botanical',
  'herbarium',
  'ornith',
  'anomaloglossus',
];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function asDefArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const maybeDef = (item as UnknownRecord).def;
      return typeof maybeDef === 'string' ? maybeDef.trim() : '';
    })
    .filter(Boolean);
}

function flattenLangAware(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const result: string[] = [];
  for (const entry of Object.values(value as UnknownRecord)) {
    result.push(...asStringArray(entry));
  }
  return dedupe(result);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = value.trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function toJoined(values: string[]): string {
  return dedupe(values).join(' | ');
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFloats(values: string[]): number[] {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function hasSurinameCoordinates(latitudes: string[], longitudes: string[]): boolean {
  const latValues = parseFloats(latitudes);
  const lonValues = parseFloats(longitudes);
  return latValues.some((lat) => lat >= 1.7 && lat <= 6.1) && lonValues.some((lon) => lon >= -58.2 && lon <= -53.8);
}

function containsAnyToken(values: string[], tokens: string[]): boolean {
  const normalized = values.map(normalizeText);
  return tokens.some((token) => {
    const normalizedToken = normalizeText(token);
    return normalized.some((value) => value.includes(normalizedToken));
  });
}

function hasSurinamePlaceUri(placeUris: string[]): boolean {
  return placeUris.some((uri) =>
    SURINAME_PLACE_URI_MARKERS.some((marker) => uri.toLowerCase().includes(marker)),
  );
}

function getSurinameConfidence(
  hasSurinameUri: boolean,
  hasSurinameCoord: boolean,
  hasSurinameLabel: boolean,
  hasNonSurinamePrimarySignal: boolean,
): ExportRow['surinameConfidence'] {
  if (hasSurinameUri || hasSurinameCoord) return 'strict';
  if (hasSurinameLabel && !hasNonSurinamePrimarySignal) return 'probable';
  if (hasSurinameLabel) return 'weak';
  return 'none';
}

function looksLikeBinomialName(values: string[]): boolean {
  return values.some((value) => /\b[A-Z][a-z]{2,}\s+[a-z][a-z-]{2,}\b/.test(value));
}

function hasLocationSignal(item: EuropeanaSearchItem): boolean {
  const locationFields = [
    ...asStringArray(item.edmPlace),
    ...asDefArray(item.edmPlaceLabel),
    ...flattenLangAware(item.edmPlaceLabelLangAware),
    ...asStringArray(item.edmPlaceLatitude),
    ...asStringArray(item.edmPlaceLongitude),
    ...asStringArray(item.dcCoverage),
    ...flattenLangAware(item.dcCoverageLangAware),
    ...asStringArray(item.dcSubject),
    ...flattenLangAware(item.dcSubjectLangAware),
  ];
  return locationFields.length > 0;
}

function hasPersonSignal(item: EuropeanaSearchItem): boolean {
  const personFields = [
    ...asStringArray(item.dcCreator),
    ...flattenLangAware(item.dcCreatorLangAware),
    ...asStringArray(item.dcContributor),
    ...flattenLangAware(item.dcContributorLangAware),
    ...asStringArray(item.edmAgent),
    ...asDefArray(item.edmAgentLabel),
    ...flattenLangAware(item.edmAgentLabelLangAware),
  ];
  return personFields.length > 0;
}

function buildLocationSignals(item: EuropeanaSearchItem): string[] {
  return dedupe([
    ...asStringArray(item.edmPlace),
    ...asDefArray(item.edmPlaceLabel),
    ...flattenLangAware(item.edmPlaceLabelLangAware),
    ...asStringArray(item.edmPlaceLatitude),
    ...asStringArray(item.edmPlaceLongitude),
    ...asStringArray(item.dcCoverage),
    ...flattenLangAware(item.dcCoverageLangAware),
  ]);
}

function buildPersonSignals(item: EuropeanaSearchItem): string[] {
  return dedupe([
    ...asStringArray(item.dcCreator),
    ...flattenLangAware(item.dcCreatorLangAware),
    ...asStringArray(item.dcContributor),
    ...flattenLangAware(item.dcContributorLangAware),
    ...asDefArray(item.edmAgentLabel),
    ...flattenLangAware(item.edmAgentLabelLangAware),
  ]);
}

function itemToRow(item: EuropeanaSearchItem): ExportRow {
  const personSignals = buildPersonSignals(item);
  const locationSignals = buildLocationSignals(item);
  const locationPresent = locationSignals.length > 0;
  const personPresent = personSignals.length > 0;

  const imageOrAvUri = asStringArray(item.edmIsShownBy)[0] || '';
  const sourceLandingPage = asStringArray(item.edmIsShownAt)[0] || '';
  const previewUri = asStringArray(item.edmPreview)[0] || '';

  const placeUris = asStringArray(item.edmPlace);
  const placeLatitudes = asStringArray(item.edmPlaceLatitude);
  const placeLongitudes = asStringArray(item.edmPlaceLongitude);
  const placeLabels = [
    ...asDefArray(item.edmPlaceLabel),
    ...flattenLangAware(item.edmPlaceLabelLangAware),
  ];
  const subjectLikeSignals = [
    ...asStringArray(item.dcSubject),
    ...flattenLangAware(item.dcSubjectLangAware),
    ...asStringArray(item.dcCoverage),
    ...flattenLangAware(item.dcCoverageLangAware),
    ...(item.title || []),
  ];

  const surinameUri = hasSurinamePlaceUri(placeUris);
  const surinameCoord = hasSurinameCoordinates(placeLatitudes, placeLongitudes);
  const surinameLabel = containsAnyToken([...placeLabels, ...subjectLikeSignals], SURINAME_TOKENS);
  const nonSurinamePrimarySignal = containsAnyToken(placeLabels, NON_SURINAME_TOKENS);
  const surinameConfidence = getSurinameConfidence(
    surinameUri,
    surinameCoord,
    surinameLabel,
    nonSurinamePrimarySignal,
  );

  const institutionFields = [
    ...asStringArray(item.dataProvider),
    ...asStringArray(item.provider),
  ];
  const contentFields = [
    ...(item.title || []),
    ...asStringArray(item.dcDescription),
    ...flattenLangAware(item.dcDescriptionLangAware),
    ...asStringArray(item.dcSubject),
    ...flattenLangAware(item.dcSubjectLangAware),
  ];
  const naturalHistoryByInstitution = containsAnyToken(
    institutionFields,
    NATURAL_HISTORY_INSTITUTION_TOKENS,
  );
  const naturalHistoryByContent =
    containsAnyToken(contentFields, NATURAL_HISTORY_CONTENT_TOKENS) ||
    looksLikeBinomialName([...(item.title || []), ...asStringArray(item.dcSubject)]);
  const naturalHistorySignals = dedupe([
    ...(naturalHistoryByInstitution
      ? institutionFields.filter((value) =>
          NATURAL_HISTORY_INSTITUTION_TOKENS.some((token) =>
            normalizeText(value).includes(normalizeText(token)),
          ),
        )
      : []),
    ...(naturalHistoryByContent
      ? contentFields.filter((value) =>
          NATURAL_HISTORY_CONTENT_TOKENS.some((token) =>
            normalizeText(value).includes(normalizeText(token)),
          ),
        )
      : []),
  ]);
  const naturalHistoryFlag = naturalHistoryByInstitution || (naturalHistoryByContent && naturalHistorySignals.length > 0);

  return {
    id: item.id || '',
    guid: item.guid || '',
    apiRecord: item.link || '',
    type: item.type || '',
    title: toJoined([...(item.title || []), ...flattenLangAware(item.dcTitleLangAware)]),
    descriptions: toJoined([
      ...asStringArray(item.dcDescription),
      ...flattenLangAware(item.dcDescriptionLangAware),
    ]),
    creators: toJoined([
      ...asStringArray(item.dcCreator),
      ...flattenLangAware(item.dcCreatorLangAware),
    ]),
    contributors: toJoined([
      ...asStringArray(item.dcContributor),
      ...flattenLangAware(item.dcContributorLangAware),
    ]),
    personNames: toJoined([
      ...asDefArray(item.edmAgentLabel),
      ...flattenLangAware(item.edmAgentLabelLangAware),
    ]),
    placeLabels: toJoined(placeLabels),
    placeUris: toJoined(placeUris),
    placeLatitudes: toJoined(placeLatitudes),
    placeLongitudes: toJoined(placeLongitudes),
    locationSignals: toJoined(locationSignals),
    personSignals: toJoined(personSignals),
    hasLocationSignal: locationPresent,
    hasPersonSignal: personPresent,
    sourceInstitution: toJoined(asStringArray(item.dataProvider)),
    provider: toJoined(asStringArray(item.provider)),
    imageOrAvUri,
    sourceLandingPage,
    previewUri,
    rights: toJoined(asStringArray(item.rights)),
    country: toJoined(asStringArray(item.country)),
    year: toJoined(asStringArray(item.year)),
    hasSurinamePlaceUri: surinameUri,
    hasSurinameCoordinate: surinameCoord,
    hasSurinameLabelToken: surinameLabel,
    hasNonSurinamePrimarySignal: nonSurinamePrimarySignal,
    surinameConfidence,
    isStrictSuriname: surinameConfidence === 'strict' || surinameConfidence === 'probable',
    naturalHistoryByInstitution,
    naturalHistoryByContent,
    naturalHistoryFlag,
    naturalHistorySignals: toJoined(naturalHistorySignals),
  };
}

async function fetchSearchPage(start: number, cursor: string): Promise<EuropeanaSearchResponse> {
  const params = new URLSearchParams({
    wskey: API_KEY,
    query: QUERY,
    profile: PROFILE,
    rows: String(ROWS),
  });

  if (PAGINATION_MODE === 'cursor') {
    params.set('cursor', cursor);
  } else {
    params.set('start', String(start));
  }

  params.append('qf', 'TYPE:IMAGE');
  params.append('qf', 'TYPE:VIDEO');
  params.append('qf', 'TYPE:SOUND');

  if (REUSABILITY) {
    params.set('reusability', REUSABILITY);
  }

  const url = `https://api.europeana.eu/record/v2/search.json?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Europeana API request failed (${response.status}) for start=${start}`);
  }
  return (await response.json()) as EuropeanaSearchResponse;
}

function toCsv(rows: ExportRow[]): string {
  const headers: Array<keyof ExportRow> = [
    'id',
    'guid',
    'apiRecord',
    'type',
    'title',
    'descriptions',
    'creators',
    'contributors',
    'personNames',
    'placeLabels',
    'placeUris',
    'placeLatitudes',
    'placeLongitudes',
    'locationSignals',
    'personSignals',
    'hasLocationSignal',
    'hasPersonSignal',
    'sourceInstitution',
    'provider',
    'imageOrAvUri',
    'sourceLandingPage',
    'previewUri',
    'rights',
    'country',
    'year',
    'hasSurinamePlaceUri',
    'hasSurinameCoordinate',
    'hasSurinameLabelToken',
    'hasNonSurinamePrimarySignal',
    'surinameConfidence',
    'isStrictSuriname',
    'naturalHistoryByInstitution',
    'naturalHistoryByContent',
    'naturalHistoryFlag',
    'naturalHistorySignals',
  ];

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(String(row[header]))).join(','));
  }
  return lines.join('\n');
}

function buildSummary(
  totalFetched: number,
  retainedRows: ExportRow[],
  pagesFetched: number,
  hitApiPaginationLimit: boolean,
): string {
  const byType = new Map<string, number>();
  let withLocation = 0;
  let withPerson = 0;
  let withBoth = 0;
  let withMediaUri = 0;
  let strictSuriname = 0;
  let naturalHistoryCount = 0;
  let naturalHistoryInstitutionCount = 0;
  let naturalHistoryContentCount = 0;
  const bySurinameConfidence = new Map<ExportRow['surinameConfidence'], number>([
    ['strict', 0],
    ['probable', 0],
    ['weak', 0],
    ['none', 0],
  ]);

  for (const row of retainedRows) {
    byType.set(row.type || 'UNKNOWN', (byType.get(row.type || 'UNKNOWN') || 0) + 1);
    if (row.hasLocationSignal) withLocation += 1;
    if (row.hasPersonSignal) withPerson += 1;
    if (row.hasLocationSignal && row.hasPersonSignal) withBoth += 1;
    if (row.imageOrAvUri || row.previewUri || row.sourceLandingPage) withMediaUri += 1;
    if (row.isStrictSuriname) strictSuriname += 1;
    if (row.naturalHistoryFlag) naturalHistoryCount += 1;
    if (row.naturalHistoryByInstitution) naturalHistoryInstitutionCount += 1;
    if (row.naturalHistoryByContent) naturalHistoryContentCount += 1;
    bySurinameConfidence.set(
      row.surinameConfidence,
      (bySurinameConfidence.get(row.surinameConfidence) || 0) + 1,
    );
  }

  const typeLines = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `- ${type}: ${count}`);

  const lines = [
    '# Europeana Suriname AV/Image Metadata Export',
    '',
    `- Query: ${QUERY}`,
    `- Types: IMAGE, VIDEO, SOUND`,
    `- Profile: ${PROFILE}`,
    `- Pagination mode: ${PAGINATION_MODE}`,
    `- Reusability filter: ${REUSABILITY || 'none'}`,
    `- API key: ${API_KEY === 'apidemo' ? 'apidemo (demo key, heavily limited)' : 'custom key'}`,
    `- Pages fetched: ${pagesFetched}`,
    `- Records fetched before STM-link filter: ${totalFetched}`,
    `- Hit Europeana start-offset limit: ${hitApiPaginationLimit ? 'yes (stopped early at API limit)' : 'no'}`,
    `- Records retained: ${retainedRows.length}`,
    `- Retained with location signal: ${withLocation}`,
    `- Retained with person signal: ${withPerson}`,
    `- Retained with both signals: ${withBoth}`,
    `- Retained with at least one media URI or landing page: ${withMediaUri}`,
    `- Strict Suriname subset (strict + probable): ${strictSuriname}`,
    `- Natural history flagged (institution or content): ${naturalHistoryCount}`,
    `- Natural history flagged by institution: ${naturalHistoryInstitutionCount}`,
    `- Natural history flagged by content: ${naturalHistoryContentCount}`,
    '',
    '## Suriname confidence buckets',
    `- strict: ${bySurinameConfidence.get('strict') || 0}`,
    `- probable: ${bySurinameConfidence.get('probable') || 0}`,
    `- weak: ${bySurinameConfidence.get('weak') || 0}`,
    `- none: ${bySurinameConfidence.get('none') || 0}`,
    '',
    '## Retained records by type',
    ...typeLines,
    '',
    '## Filter logic',
    REQUIRE_LINKABLE
      ? '- Kept only records with location metadata and/or person metadata.'
      : '- Kept all AV/image records regardless of location/person metadata.',
  ];

  return lines.join('\n');
}

async function main() {
  if (API_KEY === 'apidemo') {
    console.warn('Using apidemo key. Expect low daily quota and incomplete export.');
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const allRows: ExportRow[] = [];
  let start = 1;
  let cursor = '*';
  let totalResults = Number.POSITIVE_INFINITY;
  let pagesFetched = 0;
  let fetchedBeforeFilter = 0;
  let hitApiPaginationLimit = false;

  while (PAGINATION_MODE === 'cursor' || start <= totalResults) {
    let response: EuropeanaSearchResponse;
    try {
      response = await fetchSearchPage(start, cursor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Europeana API request failed (400)') && start > 1 && PAGINATION_MODE !== 'cursor') {
        hitApiPaginationLimit = true;
        console.warn(`Stopped at Europeana API offset limit (start=${start}). Proceeding with fetched records.`);
        break;
      }
      throw error;
    }

    if (!response.success) {
      throw new Error(`Europeana API returned success=false at start=${start}`);
    }

    totalResults = response.totalResults;
    const items = response.items || [];
    if (items.length === 0) break;
    fetchedBeforeFilter += items.length;

    for (const item of items) {
      const row = itemToRow(item);
      if (!REQUIRE_LINKABLE || row.hasLocationSignal || row.hasPersonSignal) {
        allRows.push(row);
      }
      if (MAX_RECORDS > 0 && allRows.length >= MAX_RECORDS) {
        break;
      }
    }

    pagesFetched += 1;
    console.log(`Fetched page ${pagesFetched}; retained ${allRows.length} records so far.`);

    if (MAX_RECORDS > 0 && allRows.length >= MAX_RECORDS) {
      break;
    }

    if (PAGINATION_MODE === 'cursor') {
      if (!response.nextCursor || response.nextCursor === cursor) {
        break;
      }
      cursor = response.nextCursor;
    } else {
      start += ROWS;
    }
  }

  writeFileSync(OUTPUT_JSON, JSON.stringify(allRows, null, 2), 'utf8');
  writeFileSync(OUTPUT_CSV, toCsv(allRows), 'utf8');
  const strictRows = allRows.filter((row) => row.isStrictSuriname);
  writeFileSync(OUTPUT_STRICT_JSON, JSON.stringify(strictRows, null, 2), 'utf8');
  writeFileSync(OUTPUT_STRICT_CSV, toCsv(strictRows), 'utf8');

  const summary = buildSummary(
    fetchedBeforeFilter,
    allRows,
    pagesFetched,
    hitApiPaginationLimit,
  );
  writeFileSync(OUTPUT_SUMMARY, summary, 'utf8');

  console.log(`Wrote ${allRows.length} records to:`);
  console.log(`- ${OUTPUT_JSON}`);
  console.log(`- ${OUTPUT_CSV}`);
  console.log(`- ${OUTPUT_STRICT_JSON}`);
  console.log(`- ${OUTPUT_STRICT_CSV}`);
  console.log(`- ${OUTPUT_SUMMARY}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});