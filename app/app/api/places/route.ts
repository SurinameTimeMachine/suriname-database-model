import { hasRepoAccess, readRepoFile, writeRepoFile } from '@/lib/github';
import { getSessionToken } from '@/lib/session';
import type { GazetteerPlace } from '@/lib/types';
import { NextRequest, NextResponse } from 'next/server';

const GAZETTEER_PATH = 'data/places-gazetteer.json';

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
    const gazetteer: GazetteerPlace[] = JSON.parse(content);

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

    // Sort: districts, rivers, settlements, plantations
    const typeOrder: Record<string, number> = {
      district: 0,
      river: 1,
      settlement: 2,
      plantation: 3,
    };
    gazetteer.sort((a, b) => {
      const diff = (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9);
      return diff !== 0 ? diff : a.prefLabel.localeCompare(b.prefLabel);
    });

    // Commit to GitHub
    const commitMsg =
      idx >= 0
        ? `Update place: ${place.prefLabel}`
        : `Add place: ${place.prefLabel}`;

    await writeRepoFile(
      token,
      GAZETTEER_PATH,
      JSON.stringify(gazetteer, null, 2),
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
