import { hasRepoAccess, readRepoFile, writeRepoFile } from '@/lib/github';
import { getSessionToken } from '@/lib/session';
import type { GazetteerPlace } from '@/lib/types';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

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

/** Save an updated place to the gazetteer via GitHub Contents API. */
export async function POST(request: NextRequest) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const canEdit = await hasRepoAccess(token);
  if (!canEdit) {
    return NextResponse.json(
      { error: 'No push access to repo' },
      { status: 403 },
    );
  }

  const place: GazetteerPlace = await request.json();

  // Validate required fields
  if (!place.id || !place.prefLabel || !place.type) {
    return NextResponse.json(
      { error: 'Missing required fields: id, prefLabel, type' },
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

    // Sort by type order from thesaurus then name
    const typeOrder = loadTypeOrder();
    gazetteer.sort((a, b) => {
      const diff = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
      return diff !== 0 ? diff : a.prefLabel.localeCompare(b.prefLabel);
    });

    // Update @graph in the JSON-LD envelope
    jsonld['@graph'] = gazetteer;

    // Commit to GitHub
    const commitMsg =
      idx >= 0
        ? `Update place: ${place.prefLabel}`
        : `Add place: ${place.prefLabel}`;

    await writeRepoFile(
      token,
      GAZETTEER_PATH,
      JSON.stringify(jsonld, null, 2),
      sha,
      commitMsg,
    );

    return NextResponse.json({ ok: true, place });
  } catch (err) {
    console.error('Save place error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save' },
      { status: 500 },
    );
  }
}
