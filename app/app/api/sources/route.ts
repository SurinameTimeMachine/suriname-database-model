import { hasRepoAccess, readRepoFile, writeRepoFile } from '@/lib/github';
import { getSessionToken } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

const REGISTRY_PATH = 'data/sources-registry.jsonld';

const BASE_URI = 'https://data.suriname-timemachine.org/source/';
const TYPE_BASE = 'https://data.suriname-timemachine.org/type/source-type/';

interface SourcePayload {
  sourceId: string;
  prefLabel: string;
  description: string | null;
  categoryId: string; // maps to P2_has_type URI
  linkedToGazetteer: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Shared auth check */
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

/** Update or add a source in the registry via GitHub. */
export async function POST(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { token } = auth;

  const payload: SourcePayload = await request.json();

  if (!payload.prefLabel?.trim()) {
    return NextResponse.json(
      { error: 'Missing required field: prefLabel' },
      { status: 400 },
    );
  }

  if (!payload.categoryId?.trim()) {
    return NextResponse.json(
      { error: 'Missing required field: categoryId' },
      { status: 400 },
    );
  }

  try {
    const { content, sha } = await readRepoFile(token, REGISTRY_PATH);
    const jsonld = JSON.parse(content);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graph: any[] = jsonld['@graph'] || [];

    const isNew = !payload.sourceId;
    const sourceId = isNew ? slugify(payload.prefLabel) : payload.sourceId;
    const atId = `${BASE_URI}${sourceId}`;
    const typeUri = `${TYPE_BASE}${payload.categoryId}`;

    // Check for duplicate sourceId on new entries
    if (isNew && graph.some((e) => e.sourceId === sourceId)) {
      return NextResponse.json(
        { error: `Source ID "${sourceId}" already exists` },
        { status: 409 },
      );
    }

    const idx = graph.findIndex(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) =>
        e.sourceId === sourceId &&
        (Array.isArray(e['@type'])
          ? e['@type'].includes('crm:E22_Human-Made_Object')
          : e['@type'] === 'crm:E22_Human-Made_Object'),
    );

    if (idx >= 0) {
      // Update existing — only touch editable fields
      graph[idx].prefLabel = payload.prefLabel.trim();
      graph[idx].description = payload.description?.trim() || undefined;
      graph[idx].P2_has_type = typeUri;
      graph[idx].linkedToGazetteer = payload.linkedToGazetteer;
    } else {
      // Insert new source after the last category entry
      const lastCatIdx = graph.reduce(
        (acc, e, i) =>
          Array.isArray(e['@type']) && e['@type'].includes('crm:E55_Type')
            ? i
            : acc,
        -1,
      );

      const newEntry: Record<string, unknown> = {
        '@id': atId,
        '@type': ['crm:E22_Human-Made_Object'],
        sourceId,
        prefLabel: payload.prefLabel.trim(),
        P2_has_type: typeUri,
        linkedToGazetteer: payload.linkedToGazetteer,
      };
      if (payload.description?.trim()) {
        newEntry.description = payload.description.trim();
      }

      graph.splice(lastCatIdx + 1, 0, newEntry);
    }

    jsonld['@graph'] = graph;

    const commitMsg =
      idx >= 0
        ? `Update source: ${payload.prefLabel}`
        : `Add source: ${payload.prefLabel}`;

    await writeRepoFile(
      token,
      REGISTRY_PATH,
      JSON.stringify(jsonld, null, 2),
      sha,
      commitMsg,
    );

    return NextResponse.json({ ok: true, sourceId });
  } catch (err) {
    console.error('Failed to save source:', err);
    return NextResponse.json(
      { error: 'Failed to save source' },
      { status: 500 },
    );
  }
}
