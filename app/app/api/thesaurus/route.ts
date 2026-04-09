import { hasRepoAccess, readRepoFile, writeRepoFile } from '@/lib/github';
import { getSessionToken } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

const THESAURUS_PATH = 'data/place-types-thesaurus.jsonld';

/** Save updated thesaurus to GitHub. */
export async function POST(request: NextRequest) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: 'You are not signed in. Please sign in with GitHub first.' },
      { status: 401 },
    );
  }

  const canEdit = await hasRepoAccess(token);
  if (!canEdit) {
    return NextResponse.json(
      {
        error:
          'You do not have edit permissions on this repository. Contact the repository owner for access.',
      },
      { status: 403 },
    );
  }

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
      `Update geographical features thesaurus`,
      sha,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save' },
      { status: 500 },
    );
  }
}
