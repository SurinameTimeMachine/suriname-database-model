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

function primaryWikidataQid(place: GazetteerPlace): string | null {
  return (
    place.externalLinks.find(
      (link) => link.authority === 'wikidata' && /^Q\d+$/.test(link.identifier),
    )?.identifier ?? null
  );
}

/**
 * Merge two or more gazetteer entries atomically. The primary place is updated
 * with the merged data; every retired place gets a `mergedInto` pointer and is
 * kept in the gazetteer for provenance.
 *
 * Body: {
 *   primaryId: string,
 *   retiredIds: string[],
 *   mergedPlace: GazetteerPlace
 * }
 *
 * `retiredId` remains accepted for older clients.
 */
export async function POST(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { token } = auth;

  const body = await request.json();
  const primaryId = body?.primaryId as unknown;
  const retiredId = body?.retiredId as unknown;
  const requestedRetiredIds = body?.retiredIds as unknown;
  const rawMergedPlace = body?.mergedPlace as unknown;
  const candidateRetiredIds: unknown[] = Array.isArray(requestedRetiredIds)
    ? requestedRetiredIds
    : typeof retiredId === 'string' && retiredId
      ? [retiredId]
      : [];

  if (
    typeof primaryId !== 'string' ||
    !primaryId ||
    !rawMergedPlace ||
    typeof rawMergedPlace !== 'object' ||
    Array.isArray(rawMergedPlace) ||
    candidateRetiredIds.length === 0 ||
    candidateRetiredIds.some(
      (id) => typeof id !== 'string' || !id || id === primaryId,
    ) ||
    new Set(candidateRetiredIds).size !== candidateRetiredIds.length
  ) {
    return NextResponse.json(
      {
        error:
          'Invalid merge request: primaryId, one or more unique retiredIds, and mergedPlace are required and must differ',
      },
      { status: 400 },
    );
  }
  const { wikidataQid: _legacyWikidataQid, ...mergedPlace } =
    rawMergedPlace as GazetteerPlace & { wikidataQid?: unknown };
  const retiredIds = candidateRetiredIds as string[];
  if (mergedPlace.id !== primaryId) {
    return NextResponse.json(
      { error: 'mergedPlace.id must match primaryId' },
      { status: 400 },
    );
  }

  try {
    const { content, sha } = await readRepoFile(token, GAZETTEER_PATH);
    const jsonld = JSON.parse(content);
    const gazetteer: GazetteerPlace[] = jsonld['@graph'] || [];

    const primaryIdx = gazetteer.findIndex((p) => p.id === primaryId);
    const retiredIndexes = retiredIds.map((retiredPlaceId) =>
      gazetteer.findIndex((place) => place.id === retiredPlaceId),
    );

    if (primaryIdx < 0) {
      return NextResponse.json(
        { error: `Primary place "${primaryId}" not found` },
        { status: 404 },
      );
    }
    const missingRetiredId = retiredIds.find(
      (retiredPlaceId, index) => retiredPlaceId && retiredIndexes[index] < 0,
    );
    if (missingRetiredId) {
      return NextResponse.json(
        { error: `Secondary place "${missingRetiredId}" not found` },
        { status: 404 },
      );
    }
    if (gazetteer[primaryIdx].mergedInto) {
      return NextResponse.json(
        { error: `Primary place "${primaryId}" is already marked as merged` },
        { status: 400 },
      );
    }
    const alreadyRetiredId = retiredIds.find(
      (retiredPlaceId, index) =>
        retiredPlaceId && gazetteer[retiredIndexes[index]].mergedInto,
    );
    if (alreadyRetiredId) {
      return NextResponse.json(
        { error: `Secondary place "${alreadyRetiredId}" is already marked as merged` },
        { status: 400 },
      );
    }

    if (retiredIds.length > 1) {
      const selectedPlaces = [
        gazetteer[primaryIdx],
        ...retiredIndexes.map((index) => gazetteer[index]),
      ];
      const primaryQid = primaryWikidataQid(selectedPlaces[0]);
      if (
        !primaryQid ||
        selectedPlaces.some((place) => primaryWikidataQid(place) !== primaryQid)
      ) {
        return NextResponse.json(
          {
            error:
              'Merging more than two records requires the same Wikidata organization QID on every selected place',
          },
          { status: 400 },
        );
      }
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

    // Mark every selected secondary entry as retired in the same commit.
    for (const retiredIdx of retiredIndexes) {
      const { wikidataQid: _retiredLegacyWikidataQid, ...retiredPlace } =
        gazetteer[retiredIdx] as GazetteerPlace & { wikidataQid?: unknown };
      gazetteer[retiredIdx] = {
        ...retiredPlace,
        mergedInto: primaryId,
        modifiedBy: login,
        modifiedAt: now,
      };
    }

    sortGazetteer(gazetteer, getPreferredName);

    jsonld['@graph'] = gazetteer;

    const jsonStr = JSON.stringify(jsonld, null, 2);
    const commit = await writeRepoFile(
      token,
      GAZETTEER_PATH,
      jsonStr,
      sha,
      `Merge places ${retiredIds.join(', ')} into ${primaryId}`,
    );

    const retiredPlaces = retiredIds.flatMap((retiredPlaceId) => {
      const place = gazetteer.find((entry) => entry.id === retiredPlaceId);
      return place ? [place] : [];
    });

    return NextResponse.json({
      ok: true,
      primaryId,
      retiredIds,
      place: prepared.place,
      retiredPlaces,
      // Preserve the single-record response for older clients.
      retiredPlace: retiredPlaces[0],
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
