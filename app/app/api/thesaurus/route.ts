import { hasRepoAccess, readRepoFile, writeRepoFile } from '@/lib/github';
import { getSessionToken } from '@/lib/session';
import { readFileSync } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';

const THESAURUS_PATH = 'data/place-types-thesaurus.jsonld';

/** Path to the local gazetteer file — used for the typeId-in-use guard. */
const GAZETTEER_FILE = join(
  process.cwd(),
  '..',
  'data',
  'places-gazetteer.jsonld',
);

/** Count active (non-deprecated, non-merged) gazetteer entries using a given typeId. */
function countActivePlacesUsingType(typeId: string): number {
  try {
    const data = JSON.parse(readFileSync(GAZETTEER_FILE, 'utf-8'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graph: any[] = data['@graph'] || [];
    return graph.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.type === typeId && !e.deprecated && !e.mergedInto,
    ).length;
  } catch {
    return 0;
  }
}

async function authorize(): Promise<
  | { token: string; error?: undefined }
  | { token?: undefined; error: NextResponse }
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

/** Save updated thesaurus to GitHub. */
export async function POST(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { token } = auth;

  const thesaurus = await request.json();

  // Basic validation: must have @context and @graph
  if (!thesaurus['@context'] || !thesaurus['@graph']) {
    return NextResponse.json(
      { error: 'Invalid thesaurus: missing @context or @graph' },
      { status: 400 },
    );
  }

  try {
    // Read current file from GitHub to get SHA
    const { sha } = await readRepoFile(token, THESAURUS_PATH);

    // Commit updated thesaurus
    await writeRepoFile(
      token,
      THESAURUS_PATH,
      JSON.stringify(thesaurus, null, 2) + '\n',
      sha,
      `Update geographical features thesaurus`,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
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

  const partial: { typeId: string; [key: string]: unknown } =
    await request.json();

  if (!partial.typeId) {
    return NextResponse.json(
      { error: 'Missing required field: typeId' },
      { status: 400 },
    );
  }

  try {
    const { content, sha } = await readRepoFile(token, THESAURUS_PATH);
    const jsonld = JSON.parse(content);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graph: any[] = jsonld['@graph'] || [];

    const idx = graph.findIndex(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.typeId === partial.typeId,
    );

    if (idx < 0) {
      return NextResponse.json(
        { error: `Concept "${partial.typeId}" not found` },
        { status: 404 },
      );
    }

    // Merge provided fields onto existing entry
    const { typeId: _id, ...fields } = partial;
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        graph[idx][key] = value;
      }
    }

    jsonld['@graph'] = graph;

    await writeRepoFile(
      token,
      THESAURUS_PATH,
      JSON.stringify(jsonld, null, 2) + '\n',
      sha,
      `Merge update concept: ${graph[idx].prefLabel || partial.typeId}`,
    );

    return NextResponse.json({ ok: true, typeId: partial.typeId });
  } catch (err) {
    console.error('Failed to merge concept:', err);
    return NextResponse.json(
      { error: 'Failed to merge concept' },
      { status: 500 },
    );
  }
}

/** Deprecate (soft-delete) a concept from the thesaurus.
 *  The entry is kept in the file with tombstone fields and owl:deprecated so its typeId is never reused.
 *  Blocked if active gazetteer places still reference this typeId and no replacedBy is provided. */
export async function DELETE(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { token } = auth;

  const { typeId, replacedBy, deprecationNote } = await request.json();

  if (!typeId) {
    return NextResponse.json(
      { error: 'Missing required field: typeId' },
      { status: 400 },
    );
  }

  // Guard: block if active places use this typeId and no replacement is specified
  const activeCount = countActivePlacesUsingType(typeId);
  if (activeCount > 0 && !replacedBy) {
    return NextResponse.json(
      {
        error: `${activeCount} active place${activeCount === 1 ? '' : 's'} use the type "${typeId}". Provide a replacedBy typeId or re-assign them first.`,
        activeCount,
      },
      { status: 409 },
    );
  }

  try {
    const { content, sha } = await readRepoFile(token, THESAURUS_PATH);
    const jsonld = JSON.parse(content);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graph: any[] = jsonld['@graph'] || [];

    const idx = graph.findIndex(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.typeId === typeId,
    );

    if (idx < 0) {
      return NextResponse.json(
        { error: `Concept "${typeId}" not found` },
        { status: 404 },
      );
    }

    if (graph[idx].deprecated === true) {
      return NextResponse.json(
        { error: `Concept "${typeId}" is already deprecated.` },
        { status: 409 },
      );
    }

    const label = graph[idx].prefLabel || typeId;
    const now = new Date().toISOString().split('T')[0];
    const { login } = await (
      await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();

    // Tombstone fields
    graph[idx].deprecated = true;
    graph[idx].deprecatedAt = now;
    graph[idx].deprecatedBy = login;
    if (replacedBy) {
      graph[idx].replacedBy = replacedBy;
    }
    if (typeof deprecationNote === 'string' && deprecationNote.trim()) {
      graph[idx].deprecationNote = deprecationNote.trim();
    }

    // Append to skos:historyNote
    const replacedMsg = replacedBy ? ` Replaced by: ${replacedBy}.` : '';
    const noteMsg = `Deprecated ${now} by ${login}.${replacedMsg}`;
    const existing = graph[idx].historyNote;
    graph[idx].historyNote = existing ? `${existing} | ${noteMsg}` : noteMsg;

    jsonld['@graph'] = graph;

    await writeRepoFile(
      token,
      THESAURUS_PATH,
      JSON.stringify(jsonld, null, 2) + '\n',
      sha,
      `Deprecate concept: ${label} (id: ${typeId})`,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete concept:', err);
    return NextResponse.json(
      { error: 'Failed to delete concept' },
      { status: 500 },
    );
  }
}
