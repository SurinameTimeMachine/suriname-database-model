// Pre-downloads NAS review thumbnails to public/data/nas-thumbnails so the event
// runs over the local network only, without depending on venue wifi to reach
// images.memorix.nl for every reviewer's device.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type NasRecord = {
  mediaId: string;
  mediaType: 'image' | 'video' | 'audio' | 'unknown';
};

const RECORDS_PATH = join(__dirname, '../..', 'data', 'nas-mediabank', 'nas-mediabank-records.json');
const OUTPUT_DIR = join(__dirname, '..', 'public', 'data', 'nas-thumbnails');
const THUMBNAIL_URL = (mediaId: string) => `https://images.memorix.nl/nas/thumb/350x350crop/${mediaId}.jpg`;

const DELAY_MS = Number(process.env.NAS_THUMB_DELAY_MS || '150');
const MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadThumbnail(mediaId: string): Promise<boolean> {
  const target = join(OUTPUT_DIR, `${mediaId}.jpg`);
  if (existsSync(target)) return false;

  let lastError: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(THUMBNAIL_URL(mediaId), {
        headers: { 'User-Agent': 'STM thumbnail cache (research use)' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(target, buffer);
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(700 * attempt);
    }
  }
  console.warn(`Failed to cache ${mediaId}: ${lastError}`);
  return false;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const records = JSON.parse(readFileSync(RECORDS_PATH, 'utf8')) as NasRecord[];
  const images = records.filter((record) => record.mediaType === 'image' && record.mediaId);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, record] of images.entries()) {
    const existed = existsSync(join(OUTPUT_DIR, `${record.mediaId}.jpg`));
    const ok = await downloadThumbnail(record.mediaId);
    if (existed) skipped += 1;
    else if (ok) downloaded += 1;
    else failed += 1;

    if ((index + 1) % 50 === 0 || index === images.length - 1) {
      console.log(`${index + 1}/${images.length} processed (downloaded ${downloaded}, skipped ${skipped}, failed ${failed})`);
    }
    if (!existed) await sleep(DELAY_MS);
  }

  console.log(`Done. downloaded=${downloaded} skipped=${skipped} failed=${failed} total=${images.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
