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

function publication(commit: string, id?: string) {
  return {
    state: 'pending-deployment' as const,
    commit,
    recordUrl: id ? `/place/${id}` : undefined,
    jsonldUrl: id ? `/place/${id}.jsonld` : undefined,
    jsonUrl: id ? `/place/${id}.json` : undefined,
  };
}

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

  const prepared = prepareEditorialPlace(await request.json());
  if (!prepared.place) {
    return NextResponse.json(
      { error: prepared.errors.join('. ') },
      { status: 400 },
    );
  }
  const place = prepared.place;

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

    if (idx >= 0) {
      gazetteer[idx] = place;
    } else {
      gazetteer.push(place);
    }

    sortGazetteer(gazetteer, getPreferredName);

    // Update @graph in the JSON-LD envelope
    jsonld['@graph'] = gazetteer;

    // Commit to GitHub
    const commitMsg =
      idx >= 0
        ? `Update place: ${getPreferredName(place)}`
        : `Add place: ${getPreferredName(place)}`;

    const jsonStr = JSON.stringify(jsonld, null, 2);
    const commit = await writeRepoFile(token, GAZETTEER_PATH, jsonStr, sha, commitMsg);

    return NextResponse.json({ ok: true, place, publication: publication(commit, place.id) });
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

  const rawPartial = (await request.json()) as Partial<GazetteerPlace> & {
    wikidataQid?: unknown;
  };
  const { wikidataQid: _legacyWikidataQid, ...partial } = rawPartial;

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

    const { wikidataQid: _existingLegacyWikidataQid, ...existingPlace } =
      gazetteer[idx] as GazetteerPlace & { wikidataQid?: unknown };

    // Merge provided fields onto existing entry
    const merged = {
      ...existingPlace,
      ...partial,
    } as GazetteerPlace & {
      '@id'?: string;
      '@type'?: string | string[];
    };
    merged.modifiedBy = login;
    merged.modifiedAt = now;

    const prepared = prepareEditorialPlace(merged);
    if (!prepared.place) {
      return NextResponse.json({ error: prepared.errors.join('. ') }, { status: 400 });
    }

    gazetteer[idx] = prepared.place;

    sortGazetteer(gazetteer, getPreferredName);

    jsonld['@graph'] = gazetteer;

    const jsonStr = JSON.stringify(jsonld, null, 2);
    const commit = await writeRepoFile(
      token,
      GAZETTEER_PATH,
      jsonStr,
      sha,
      `Merge update place: ${getPreferredName(merged)}`,
    );

    return NextResponse.json({ ok: true, place: prepared.place, publication: publication(commit, prepared.place.id) });
  } catch (err) {
    console.error('Merge place error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to merge' },
      { status: 500 },
    );
  }
}

/** Deprecate (soft-delete) a place from the gazetteer.
 *  The entry is kept in the file with tombstone fields so its URI is never reused. */
export async function DELETE(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { token } = auth;

  const { id, deprecationNote } = await request.json();

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

    if (gazetteer[idx].mergedInto) {
      return NextResponse.json(
        {
          error:
            'This place has already been merged into another entry and cannot be deprecated separately.',
        },
        { status: 409 },
      );
    }

    if (gazetteer[idx].deprecated) {
      return NextResponse.json(
        { error: `Place "${id}" is already deprecated.` },
        { status: 409 },
      );
    }

    const label = getPreferredName(gazetteer[idx]);
    const now = new Date().toISOString().split('T')[0];
    const { login } = await (
      await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();

    // Tombstone: mark deprecated in-place — never remove the entry
    const { wikidataQid: _legacyWikidataQid, ...entry } = gazetteer[
      idx
    ] as GazetteerPlace & { wikidataQid?: unknown };
    const tombstone = {
      ...entry,
      deprecated: true as const,
      deprecatedAt: now,
      deprecatedBy: login,
    };
    if (typeof deprecationNote === 'string' && deprecationNote.trim()) {
      tombstone.deprecationNote = deprecationNote.trim();
    }
    gazetteer[idx] = tombstone;

    jsonld['@graph'] = gazetteer;

    const jsonStr = JSON.stringify(jsonld, null, 2);
    const commit = await writeRepoFile(
      token,
      GAZETTEER_PATH,
      jsonStr,
      sha,
      `Deprecate place: ${label} (id: ${id})`,
    );

    return NextResponse.json({ ok: true, publication: publication(commit, id) });
  } catch (err) {
    console.error('Delete place error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete' },
      { status: 500 },
    );
  }
}
