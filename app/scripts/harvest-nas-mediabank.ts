import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

type NasRecord = {
  source: 'nas-mediabank';
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
  hasTimeAxis: boolean;
  durationSeconds: number | null;
  tcStartDefault: string;
  tcEndDefault: string;
  scrapeTimestamp: string;
};

const BASE_URL = 'https://nationaalarchief.sr';
const MEMORIX_URL = 'https://webservices.memorix.nl/mediabank';
const API_KEY = process.env.NAS_API_KEY;
const ENTITY_ID = process.env.NAS_ENTITY_ID || 'fb953082-397a-912a-90b0-b9a6227b532c';
const ROWS = Number(process.env.NAS_ROWS || '100');
const OUTPUT_DIR = join(__dirname, '../..', 'data', 'nas-mediabank');
const OUTPUT_RECORDS_JSON = join(OUTPUT_DIR, 'nas-mediabank-records.json');
const OUTPUT_RECORDS_CSV = join(OUTPUT_DIR, 'nas-mediabank-records.csv');
const OUTPUT_SUMMARY = join(OUTPUT_DIR, 'nas-mediabank-summary.md');

const DELAY_MS = Number(process.env.NAS_DELAY_MS || '400');
const MAX_RECORDS = Number(process.env.NAS_MAX_RECORDS || '0');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function fetchJson<T>(url: string): Promise<T> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'STM metadata harvester (research use)',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(700 * attempt);
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError || 'unknown error'}`);
}

type MemorixMetaField = {
  field: string;
  value: string | string[] | null;
};

type MemorixAsset = {
  uuid?: string;
  mediatype?: string;
  streams?: Array<{ url?: string; mimetype?: string }>;
};

type MemorixMediaRow = {
  id: string;
  metadata?: MemorixMetaField[];
  asset?: MemorixAsset[];
  links?: { media?: string };
};

type MemorixMediaResponse = {
  metadata: { pagination: { total: number; rows: number; currentPage: number; pages: number } };
  media: MemorixMediaRow[];
};

function metadataMap(row: MemorixMediaRow): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of row.metadata || []) {
    if (!entry?.field) continue;
    if (Array.isArray(entry.value)) {
      map.set(entry.field, entry.value.join(' | '));
    } else {
      map.set(entry.field, entry.value || '');
    }
  }
  return map;
}

function firstPlayableUri(assets: MemorixAsset[]): string {
  for (const asset of assets) {
    for (const stream of asset.streams || []) {
      if (stream.url) return stream.url;
    }
  }
  return '';
}

function parseDurationToSeconds(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const parts = cleaned.split(':').map((value) => Number(value.trim()));
  if (parts.some((value) => !Number.isFinite(value))) return null;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

function secondsToTimecode(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000`;
}

function deriveMediaType(documentType: string): NasRecord['mediaType'] {
  const normalized = documentType.toLowerCase();
  if (normalized.includes('video')) return 'video';
  if (normalized.includes('audio') || normalized.includes('geluid')) return 'audio';
  if (normalized.includes('foto') || normalized.includes('afbeeld') || normalized.includes('image')) {
    return 'image';
  }
  return 'unknown';
}

function parseRecord(row: MemorixMediaRow, listingPage: number): NasRecord {
  const metadata = metadataMap(row);
  const title = metadata.get('title') || '';
  const description = metadata.get('description') || '';
  const documentType = metadata.get('documenttype') || '';
  const inventoryNumber = metadata.get('inventorynumber') || '';
  const maker = metadata.get('producer_creator') || '';
  const yearRaw = metadata.get('date_year') || '';
  const personsRaw = metadata.get('people') || '';
  const colorRaw = metadata.get('color') || '';
  const collectionRaw = metadata.get('collection') || '';
  const playtimeRaw = metadata.get('playtime') || '';
  const keywordsRaw = metadata.get('keywords') || '';
  const downloadableRaw = metadata.get('downloadable') || '';

  const durationSeconds = parseDurationToSeconds(playtimeRaw);
  const firstAsset = row.asset?.[0];
  const assetMediaType = (firstAsset?.mediatype || '').toLowerCase();
  const mediaType =
    assetMediaType === 'video' || assetMediaType === 'audio' || assetMediaType === 'image'
      ? (assetMediaType as NasRecord['mediaType'])
      : deriveMediaType(documentType);
  const hasTimeAxis = mediaType === 'video' || mediaType === 'audio';
  const tcStartDefault = '00:00:00.000';
  const tcEndDefault = durationSeconds !== null ? secondsToTimecode(durationSeconds) : '';

  const detailId = row.id;
  const mediaId = firstAsset?.uuid || '';
  const detailUrl = row.links?.media || `${MEMORIX_URL}/media/${row.id}`;
  const recordKey = `${detailId}::${mediaId}`;

  return {
    source: 'nas-mediabank',
    detailId,
    mediaId,
    recordKey,
    detailUrl: `${detailUrl} | ${firstPlayableUri(row.asset || [])}`,
    listingPage,
    title,
    description,
    documentType,
    inventoryNumber,
    maker,
    yearRaw,
    personsRaw,
    colorRaw,
    collectionRaw,
    keywordsRaw,
    downloadableRaw,
    playtimeRaw,
    mediaType,
    hasTimeAxis,
    durationSeconds,
    tcStartDefault,
    tcEndDefault,
    scrapeTimestamp: new Date().toISOString(),
  };
}

function toRecordsCsv(rows: NasRecord[]): string {
  const headers: Array<keyof NasRecord> = [
    'source',
    'detailId',
    'mediaId',
    'recordKey',
    'detailUrl',
    'listingPage',
    'title',
    'description',
    'documentType',
    'inventoryNumber',
    'maker',
    'yearRaw',
    'personsRaw',
    'colorRaw',
    'collectionRaw',
    'keywordsRaw',
    'downloadableRaw',
    'playtimeRaw',
    'mediaType',
    'hasTimeAxis',
    'durationSeconds',
    'tcStartDefault',
    'tcEndDefault',
    'scrapeTimestamp',
  ];
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(String(row[header] ?? ''))).join(',')),
  ].join('\n');
}

function buildSummary(records: NasRecord[], totalTarget: number): string {
  const byType = new Map<string, number>();
  let downloadable = 0;
  let withDuration = 0;
  for (const row of records) {
    byType.set(row.mediaType, (byType.get(row.mediaType) || 0) + 1);
    if (row.downloadableRaw.toLowerCase().includes('ja')) downloadable += 1;
    if (row.durationSeconds !== null) withDuration += 1;
  }

  return [
    '# NAS Mediabank Harvest Summary',
    '',
    `- Target records reported by NAS: ${totalTarget}`,
    `- Harvested unique records: ${records.length}`,
    `- Memorix rows per page: ${ROWS}`,
    `- Delay per request (ms): ${DELAY_MS}`,
    `- AV records with parsed duration: ${withDuration}`,
    `- Downloadable marked yes: ${downloadable}`,
    '',
    '## By media type',
    ...[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => `- ${type}: ${count}`),
  ].join('\n');
}

function writeAll(records: NasRecord[], totalTarget: number): void {
  writeFileSync(OUTPUT_RECORDS_JSON, JSON.stringify(records, null, 2), 'utf8');
  writeFileSync(OUTPUT_RECORDS_CSV, toRecordsCsv(records), 'utf8');
  writeFileSync(OUTPUT_SUMMARY, buildSummary(records, totalTarget), 'utf8');
}

async function main(): Promise<void> {
  if (!API_KEY) {
    throw new Error('NAS_API_KEY is required to harvest the NAS Mediabank.');
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const records: NasRecord[] = [];
  const seen = new Set<string>();
  const firstUrl = new URL(`${MEMORIX_URL}/media`);
  firstUrl.searchParams.set('apiKey', API_KEY);
  firstUrl.searchParams.append('entities[]', ENTITY_ID);
  firstUrl.searchParams.set('rows', String(ROWS));
  firstUrl.searchParams.set('page', '1');
  const firstPage = await fetchJson<MemorixMediaResponse>(firstUrl.toString());
  const totalTarget = firstPage.metadata?.pagination?.total || 0;
  const totalPages = firstPage.metadata?.pagination?.pages || 0;
  console.log(`NAS reports ${totalTarget} records across ${totalPages} pages.`);

  for (let page = 1; page <= totalPages; page += 1) {
    if (MAX_RECORDS > 0 && records.length >= MAX_RECORDS) break;

    const pageData =
      page === 1
        ? firstPage
        : await fetchJson<MemorixMediaResponse>(
            `${MEMORIX_URL}/media?apiKey=${encodeURIComponent(API_KEY)}&entities[]=${encodeURIComponent(
              ENTITY_ID,
            )}&rows=${ROWS}&page=${page}`,
          );

    for (const row of pageData.media || []) {
      const record = parseRecord(row, page);
      if (!record.recordKey || seen.has(record.recordKey)) continue;
      seen.add(record.recordKey);
      records.push(record);
      if (MAX_RECORDS > 0 && records.length >= MAX_RECORDS) break;
    }

    if (page % 5 === 0) {
      writeAll(records, totalTarget);
      console.log(`Checkpoint: page ${page}/${totalPages}; ${records.length} unique records.`);
    }

    await sleep(DELAY_MS);
  }

  writeAll(records, totalTarget);

  console.log(`Wrote ${records.length} NAS records to:`);
  console.log(`- ${OUTPUT_RECORDS_JSON}`);
  console.log(`- ${OUTPUT_RECORDS_CSV}`);
  console.log(`- ${OUTPUT_SUMMARY}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
