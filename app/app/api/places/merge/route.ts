import { hasRepoAccess, readRepoFile, writeRepoFile } from '@/lib/github';
import {
  prepareEditorialPlace,
  sortGazetteer,
} from '@/lib/gazetteer-editorial';
import { getSessionToken } from '@/lib/session';
import type { GazetteerPlace } from '@/lib/types';
import { getPreferredName } from '@/lib/types';
import { NextRequest, NextResponse } from 'next/server';

const GAZETTEER_PATH = 'data/places-gazetteer.jsonld';

function publication(commit: string, id: string) {
  return {
    state: 'pending-deployment' as const,
    commit,
    recordUrl: `/place/${id}`,
    jsonldUrl: `/place/${id}.jsonld`,
    jsonUrl: `/place/${id}.json`,
  };
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
    mergedPlace: rawMergedPlace,
  }: {
    primaryId: string;
    retiredId: string;
    mergedPlace: GazetteerPlace & { wikidataQid?: unknown };
  } = body;
  const { wikidataQid: _legacyWikidataQid, ...mergedPlace } = rawMergedPlace || {};

  if (!primaryId || !retiredId || !rawMergedPlace || primaryId === retiredId) {
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

    mergedPlace.modifiedBy = login;
    mergedPlace.modifiedAt = now;

    const prepared = prepareEditorialPlace(mergedPlace);
    if (!prepared.place) {
      return NextResponse.json(
        { error: prepared.errors.join('. ') },
        { status: 400 },
      );
    }

    // Update the primary entry
    gazetteer[primaryIdx] = prepared.place;

    // Mark the retired entry
    gazetteer[retiredIdx] = {
      ...gazetteer[retiredIdx],
      mergedInto: primaryId,
      modifiedBy: login,
      modifiedAt: now,
    };

    sortGazetteer(gazetteer, getPreferredName);

    jsonld['@graph'] = gazetteer;

    const jsonStr = JSON.stringify(jsonld, null, 2);
    const commit = await writeRepoFile(
      token,
      GAZETTEER_PATH,
      jsonStr,
      sha,
      `Merge place ${retiredId} into ${primaryId}`,
    );

    return NextResponse.json({
      ok: true,
      primaryId,
      retiredId,
      place: prepared.place,
      retiredPlace: gazetteer.find((place) => place.id === retiredId),
      publication: publication(commit, primaryId),
    });
  } catch (err) {
    console.error('Merge places error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to merge places' },
      { status: 500 },
    );
  }
}
