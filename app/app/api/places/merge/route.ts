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

const THESAURUS_FILE = join(
  process.cwd(),
  '..',
  'data',
  'place-types-thesaurus.jsonld',
);

const GAZETTEER_PATH = 'data/places-gazetteer.jsonld';

function syncPublicCopy(jsonldStr: string) {
  try {
    writeFileSync(PUBLIC_GAZETTEER, jsonldStr, 'utf-8');
  } catch (err) {
    console.error(
      'Failed to sync public gazetteer copy',
      PUBLIC_GAZETTEER,
      err,
    );
  }
}

function readThesaurusGraph(): Record<string, unknown>[] {
  try {
    const data = JSON.parse(readFileSync(THESAURUS_FILE, 'utf-8'));
    return (data['@graph'] || []) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function loadCrmMapping(): Record<string, string> {
  return Object.fromEntries(
    readThesaurusGraph()
      .filter((e) => e.typeId)
      .map((e) => [e.typeId as string, e.crmClass as string]),
  );
}

function loadTypeOrder(): Record<string, number> {
  return Object.fromEntries(
    readThesaurusGraph()
      .filter((e) => e.typeId && typeof e.sortOrder === 'number')
      .map((e) => [e.typeId as string, e.sortOrder as number]),
  );
}

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

/**
 * Merge two gazetteer entries. The primary place is updated with the merged
 * data; the secondary (retired) place gets a `mergedInto` pointer and is kept
 * in the gazetteer for provenance.
 *
 * Body: { primaryId: string, retiredId: string, mergedPlace: GazetteerPlace }
 */
export async function POST(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { token } = auth;

  const body = await request.json();
  const {
    primaryId,
    retiredId,
    mergedPlace,
  }: {
    primaryId: string;
    retiredId: string;
    mergedPlace: GazetteerPlace;
  } = body;

  if (!primaryId || !retiredId || !mergedPlace || primaryId === retiredId) {
    return NextResponse.json(
      {
        error:
          'Invalid merge request: primaryId, retiredId and mergedPlace are required and must differ',
      },
      { status: 400 },
    );
  }

  try {
    const { content, sha } = await readRepoFile(token, GAZETTEER_PATH);
    const jsonld = JSON.parse(content);
    const gazetteer: GazetteerPlace[] = jsonld['@graph'] || [];

    const primaryIdx = gazetteer.findIndex((p) => p.id === primaryId);
    const retiredIdx = gazetteer.findIndex((p) => p.id === retiredId);

    if (primaryIdx < 0) {
      return NextResponse.json(
        { error: `Primary place "${primaryId}" not found` },
        { status: 404 },
      );
    }
    if (retiredIdx < 0) {
      return NextResponse.json(
        { error: `Secondary place "${retiredId}" not found` },
        { status: 404 },
      );
    }
    if (gazetteer[primaryIdx].mergedInto) {
      return NextResponse.json(
        { error: `Primary place "${primaryId}" is already marked as merged` },
        { status: 400 },
      );
    }
    if (gazetteer[retiredIdx].mergedInto) {
      return NextResponse.json(
        { error: `Secondary place "${retiredId}" is already marked as merged` },
        { status: 400 },
      );
    }

    const now = new Date().toISOString().split('T')[0];
    const { login } = await (
      await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();

    // Ensure externalLinks and derive wikidataQid
    if (!mergedPlace.externalLinks) mergedPlace.externalLinks = [];
    const wdLink = mergedPlace.externalLinks.find(
      (l: { authority: string }) => l.authority === 'wikidata',
    );
    mergedPlace.wikidataQid = wdLink ? wdLink.identifier : null;
    mergedPlace.modifiedBy = login;
    mergedPlace.modifiedAt = now;

    // Set JSON-LD properties from thesaurus
    const crmMap = loadCrmMapping();
    const crmClass = crmMap[mergedPlace.type] || 'E53_Place';

    // Update the primary entry
    gazetteer[primaryIdx] = {
      ...mergedPlace,
      '@id': `stm:place/${primaryId}`,
      '@type': crmClass,
    } as GazetteerPlace;

    // Mark the retired entry
    gazetteer[retiredIdx] = {
      ...gazetteer[retiredIdx],
      mergedInto: primaryId,
      modifiedBy: login,
      modifiedAt: now,
    };

    // Sort: merged entries sink to the bottom, then by type order + name
    const typeOrder = loadTypeOrder();
    gazetteer.sort((a, b) => {
      const aRetired = a.mergedInto ? 1 : 0;
      const bRetired = b.mergedInto ? 1 : 0;
      if (aRetired !== bRetired) return aRetired - bRetired;
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
      `Merge place ${retiredId} into ${primaryId}`,
    );
    syncPublicCopy(jsonStr);

    return NextResponse.json({ ok: true, primaryId, retiredId });
  } catch (err) {
    console.error('Merge places error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to merge places' },
      { status: 500 },
    );
  }
}
