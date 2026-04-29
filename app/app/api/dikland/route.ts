import { hasRepoAccess, readRepoFile, writeRepoFile } from '@/lib/github';
import { getSessionToken } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

const DIKLAND_PATH = 'data/dikland-collection.jsonld';

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

/** Deprecate (soft-delete) a Dikland collection entry.
 *  The entry is kept in the file with tombstone fields so its sourceId is never reused. */
export async function DELETE(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { token } = auth;

  const { sourceId, deprecationNote } = await request.json();

  if (!sourceId) {
    return NextResponse.json(
      { error: 'Missing required field: sourceId' },
      { status: 400 },
    );
  }

  try {
    const { content, sha } = await readRepoFile(token, DIKLAND_PATH);
    const jsonld = JSON.parse(content);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graph: any[] = jsonld['@graph'] || [];

    const idx = graph.findIndex(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.sourceId === sourceId,
    );

    if (idx < 0) {
      return NextResponse.json(
        { error: `Dikland entry "${sourceId}" not found` },
        { status: 404 },
      );
    }

    if (graph[idx].deprecated === true) {
      return NextResponse.json(
        { error: `Dikland entry "${sourceId}" is already deprecated.` },
        { status: 409 },
      );
    }

    const label = graph[idx].prefLabel || sourceId;
    const now = new Date().toISOString().split('T')[0];
    const { login } = await (
      await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();

    // Tombstone: mark deprecated in-place — never remove the entry
    graph[idx].deprecated = true;
    graph[idx].deprecatedAt = now;
    graph[idx].deprecatedBy = login;
    if (typeof deprecationNote === 'string' && deprecationNote.trim()) {
      graph[idx].deprecationNote = deprecationNote.trim();
    }

    jsonld['@graph'] = graph;

    await writeRepoFile(
      token,
      DIKLAND_PATH,
      JSON.stringify(jsonld, null, 2) + '\n',
      sha,
      `Deprecate Dikland entry: ${label} (id: ${sourceId})`,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to deprecate Dikland entry:', err);
    return NextResponse.json(
      { error: 'Failed to deprecate Dikland entry' },
      { status: 500 },
    );
  }
}
