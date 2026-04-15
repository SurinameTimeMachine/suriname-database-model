import { hasRepoAccess, readRepoFile, writeRepoFile } from '@/lib/github';
import { getSessionToken } from '@/lib/session';
import type { GazetteerPlace } from '@/lib/types';
import { getPreferredName } from '@/lib/types';
import { readFileSync, writeFileSync } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';

const PUBLIC_GAZETTEER = join(
  process.cwd(),
  'public',
  'data',
  'places-gazetteer.jsonld',
);

/** Best-effort sync of the public static copy so subsequent page loads
 *  reflect the latest data without needing a full rebuild. */
function syncPublicCopy(jsonldStr: string) {
  try {
    writeFileSync(PUBLIC_GAZETTEER, jsonldStr, 'utf-8');
  } catch {
    // Non-fatal: the GitHub copy is the source of truth
  }
}

const THESAURUS_FILE = join(
  process.cwd(),
  '..',
  'data',
  'place-types-thesaurus.jsonld',
);

/** Read thesaurus JSON-LD from disk */
function readThesaurusGraph(): Record<string, unknown>[] {
  try {
    const data = JSON.parse(readFileSync(THESAURUS_FILE, 'utf-8'));
    return (data['@graph'] || []) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

/** Read CRM class mapping from the thesaurus file */
function loadCrmMapping(): Record<string, string> {
  return Object.fromEntries(
    readThesaurusGraph()
      .filter((e) => e.typeId)
      .map((e) => [e.typeId as string, e.crmClass as string]),
  );
}

/** Read sort order from the thesaurus file */
function loadTypeOrder(): Record<string, number> {
  return Object.fromEntries(
    readThesaurusGraph()
      .filter((e) => e.typeId && typeof e.sortOrder === 'number')
      .map((e) => [e.typeId as string, e.sortOrder as number]),
  );
}

const GAZETTEER_PATH = 'data/places-gazetteer.jsonld';

/** Shared auth check — returns token or error response */
async function authorize(): Promise<
  { token: string; error?: never } | { token?: never; error: NextResponse }
> {
  const token = await getSessionToken();
  if (!token) {
    return {
      error: NextResponse.json(
        { error: 'You are not signed in. Please sign in with GitHub first.' },
        { status: 401 },
      ),
    };
  }

  const canEdit = await hasRepoAccess(token);
  if (!canEdit) {
    return {
      error: NextResponse.json(
        {
          error:
            'You do not have edit permissions on this repository. Contact the repository owner for access.',
        },
        { status: 403 },
      ),
    };
  }

  return { token };
}

/** Save an updated place to the gazetteer via GitHub. */
export async function POST(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { token } = auth;

  const place: GazetteerPlace = await request.json();

  // Validate required fields
  if (
    !place.id ||
    !Array.isArray(place.names) ||
    place.names.length === 0 ||
    !place.type
  ) {
    return NextResponse.json(
      { error: 'Missing required fields: id, names (non-empty), type' },
      { status: 400 },
    );
  }

  try {
    // Read current gazetteer from GitHub
    const { content, sha } = await readRepoFile(token, GAZETTEER_PATH);
    const jsonld = JSON.parse(content);
    const gazetteer: GazetteerPlace[] = jsonld['@graph'] || [];

    // Update or add the place
    const idx = gazetteer.findIndex((p) => p.id === place.id);
    const now = new Date().toISOString().split('T')[0];
    const { login } = await (
      await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();

    place.modifiedBy = login;
    place.modifiedAt = now;

    // Ensure externalLinks exists
    if (!place.externalLinks) place.externalLinks = [];

    // Derive wikidataQid from externalLinks for backward compatibility
    const wdLink = place.externalLinks.find(
      (l: { authority: string }) => l.authority === 'wikidata',
    );
    place.wikidataQid = wdLink ? wdLink.identifier : null;

    // Set JSON-LD properties from thesaurus
    const crmMap = loadCrmMapping();
    const crmClass = crmMap[place.type] || 'E53_Place';
    const entryWithLd = {
      ...place,
      '@id': `stm:place/${place.id}`,
      '@type': crmClass,
    };

    if (idx >= 0) {
      gazetteer[idx] = entryWithLd;
    } else {
      gazetteer.push(entryWithLd);
    }

    // Sort by type order from thesaurus then preferred name
    const typeOrder = loadTypeOrder();
    gazetteer.sort((a, b) => {
      const diff = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
      return diff !== 0
        ? diff
        : getPreferredName(a).localeCompare(getPreferredName(b));
    });

    // Update @graph in the JSON-LD envelope
    jsonld['@graph'] = gazetteer;

    // Commit to GitHub
    const commitMsg =
      idx >= 0
        ? `Update place: ${getPreferredName(place)}`
        : `Add place: ${getPreferredName(place)}`;

    const jsonStr = JSON.stringify(jsonld, null, 2);
    await writeRepoFile(token, GAZETTEER_PATH, jsonStr, sha, commitMsg);
    syncPublicCopy(jsonStr);

    return NextResponse.json({ ok: true, place });
  } catch (err) {
    console.error('Save place error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save' },
      { status: 500 },
    );
  }
}

/** Partial merge update — only provided fields are changed. */
export async function PUT(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { token } = auth;

  const partial = await request.json();

  if (!partial.id) {
    return NextResponse.json(
      { error: 'Missing required field: id' },
      { status: 400 },
    );
  }

  try {
    const { content, sha } = await readRepoFile(token, GAZETTEER_PATH);
    const jsonld = JSON.parse(content);
    const gazetteer: GazetteerPlace[] = jsonld['@graph'] || [];

    const idx = gazetteer.findIndex((p) => p.id === partial.id);
    if (idx < 0) {
      return NextResponse.json(
        { error: `Place "${partial.id}" not found` },
        { status: 404 },
      );
    }

    const now = new Date().toISOString().split('T')[0];
    const { login } = await (
      await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();

    // Merge provided fields onto existing entry
    const merged = { ...gazetteer[idx], ...partial };
    merged.modifiedBy = login;
    merged.modifiedAt = now;

    // Recalculate derived fields
    if (!merged.externalLinks) merged.externalLinks = [];
    const wdLink = merged.externalLinks.find(
      (l: { authority: string }) => l.authority === 'wikidata',
    );
    merged.wikidataQid = wdLink ? wdLink.identifier : null;

    const crmMap = loadCrmMapping();
    const crmClass = crmMap[merged.type] || 'E53_Place';
    merged['@id'] = `stm:place/${merged.id}`;
    merged['@type'] = crmClass;

    gazetteer[idx] = merged;

    // Sort
    const typeOrder = loadTypeOrder();
    gazetteer.sort((a, b) => {
      const diff = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
      return diff !== 0
        ? diff
        : getPreferredName(a).localeCompare(getPreferredName(b));
    });

    jsonld['@graph'] = gazetteer;

    const jsonStr = JSON.stringify(jsonld, null, 2);
    await writeRepoFile(
      token,
      GAZETTEER_PATH,
      jsonStr,
      sha,
      `Merge update place: ${getPreferredName(merged)}`,
    );
    syncPublicCopy(jsonStr);

    return NextResponse.json({ ok: true, place: merged });
  } catch (err) {
    console.error('Merge place error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to merge' },
      { status: 500 },
    );
  }
}

/** Delete a place from the gazetteer. */
export async function DELETE(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { token } = auth;

  const { id } = await request.json();

  if (!id) {
    return NextResponse.json(
      { error: 'Missing required field: id' },
      { status: 400 },
    );
  }

  try {
    const { content, sha } = await readRepoFile(token, GAZETTEER_PATH);
    const jsonld = JSON.parse(content);
    const gazetteer: GazetteerPlace[] = jsonld['@graph'] || [];

    const idx = gazetteer.findIndex((p) => p.id === id);
    if (idx < 0) {
      return NextResponse.json(
        { error: `Place "${id}" not found` },
        { status: 404 },
      );
    }

    const label = getPreferredName(gazetteer[idx]);
    gazetteer.splice(idx, 1);
    jsonld['@graph'] = gazetteer;

    const jsonStr = JSON.stringify(jsonld, null, 2);
    await writeRepoFile(token, GAZETTEER_PATH, jsonStr, sha, `Delete place: ${label}`);
    syncPublicCopy(jsonStr);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Delete place error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete' },
      { status: 500 },
    );
  }
}
