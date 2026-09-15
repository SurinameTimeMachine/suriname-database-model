// Upserts NAS image tasks (metadata only) from nas-mediabank-records.json into Supabase.
// Never mutates review state (status, assignment_count, claims, round completions).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSql } from '../lib/event-store';

type NasRecord = {
  detailId: string;
  mediaId: string;
  recordKey: string;
  detailUrl: string;
  title: string;
  description: string;
  documentType: string;
  inventoryNumber: string;
  yearRaw: string;
  mediaType: 'image' | 'video' | 'audio' | 'unknown';
};

const RECORDS_PATH = join(__dirname, '../..', 'data', 'nas-mediabank', 'nas-mediabank-records.json');
const THUMBNAIL_DIR = join(__dirname, '..', 'public', 'data', 'nas-thumbnails');
const CHUNK_SIZE = 200;

const METADATA_COLUMNS = [
  'task_id',
  'record_key',
  'detail_id',
  'media_id',
  'media_type',
  'title',
  'description',
  'year_raw',
  'inventory_number',
  'document_type',
  'source_url',
  'low_res_url',
] as const;

function splitDetailUrl(value: string): string {
  return value.split('|')[0]?.trim() || '';
}

function makeLowResUrl(mediaId: string): string {
  if (!mediaId) return '';
  if (existsSync(join(THUMBNAIL_DIR, `${mediaId}.jpg`))) {
    return `/data/nas-thumbnails/${mediaId}.jpg`;
  }
  return `https://images.memorix.nl/nas/thumb/350x350crop/${mediaId}.jpg`;
}

type TaskMetadataRow = {
  task_id: string;
  record_key: string;
  detail_id: string;
  media_id: string;
  media_type: string;
  title: string;
  description: string;
  year_raw: string;
  inventory_number: string;
  document_type: string;
  source_url: string;
  low_res_url: string;
};

async function main() {
  const records = JSON.parse(readFileSync(RECORDS_PATH, 'utf8')) as NasRecord[];
  const rows: TaskMetadataRow[] = [];
  for (const record of records) {
    if (record.mediaType !== 'image' || !record.recordKey) continue;
    rows.push({
      task_id: `img:${record.recordKey}`,
      record_key: record.recordKey,
      detail_id: record.detailId || '',
      media_id: record.mediaId || '',
      media_type: 'image',
      title: record.title || '',
      description: record.description || '',
      year_raw: record.yearRaw || '',
      inventory_number: record.inventoryNumber || '',
      document_type: record.documentType || '',
      source_url: splitDetailUrl(record.detailUrl || ''),
      low_res_url: makeLowResUrl(record.mediaId || ''),
    });
  }

  const sql = getSql();
  let synced = 0;
  for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + CHUNK_SIZE);
    await sql`
      insert into tasks ${sql(chunk, ...METADATA_COLUMNS)}
      on conflict (task_id) do update set
        record_key = excluded.record_key,
        detail_id = excluded.detail_id,
        media_id = excluded.media_id,
        media_type = excluded.media_type,
        title = excluded.title,
        description = excluded.description,
        year_raw = excluded.year_raw,
        inventory_number = excluded.inventory_number,
        document_type = excluded.document_type,
        source_url = excluded.source_url,
        low_res_url = excluded.low_res_url,
        updated_at = now()`;
    synced += chunk.length;
    console.log(`${synced}/${rows.length} tasks upserted`);
  }

  console.log(`Done. ${synced} image tasks synced to Supabase.`);
  await sql.end({ timeout: 5 });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
