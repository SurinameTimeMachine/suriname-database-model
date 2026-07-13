import { hasRepoAccess, readRepoFile, writeRepoFile } from '@/lib/github';
import { getSessionToken } from '@/lib/session';
import type { OrganizationAuthorityOverride } from '@/lib/types';
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const overridesPath = 'data/organization-authority-overrides.jsonld';
const organizationBase = 'https://data.surinametijdmachine.org/organization/';
const validStatuses = new Set(['unreviewed', 'reviewed', 'disputed']);

type WorkspaceIndexes = {
  plantations: Record<string, Record<string, unknown>>;
  appellations: Record<string, Record<string, unknown>[]>;
  observations: Record<string, Record<string, unknown>[]>;
  gazetteer: { '@graph'?: Array<Record<string, unknown>> };
  mapFeatures: {
    features?: Array<{ properties?: Record<string, unknown> }>;
  };
};

let workspaceIndexesPromise: Promise<WorkspaceIndexes> | null = null;

function loadWorkspaceIndexes(): Promise<WorkspaceIndexes> {
  workspaceIndexesPromise ??= Promise.all([
    readFile(join(process.cwd(), 'public/data/plantations.json'), 'utf-8'),
    readFile(
      join(process.cwd(), 'public/data/appellations-by-entity.json'),
      'utf-8',
    ),
    readFile(
      join(process.cwd(), 'public/data/observations-by-org.json'),
      'utf-8',
    ),
    readFile(join(process.cwd(), 'public/data/places-gazetteer.jsonld'), 'utf-8'),
    readFile(join(process.cwd(), 'public/data/map-features.geojson'), 'utf-8'),
  ]).then(([plantations, appellations, observations, gazetteer, mapFeatures]) => ({
    plantations: JSON.parse(plantations) as WorkspaceIndexes['plantations'],
    appellations: JSON.parse(appellations) as WorkspaceIndexes['appellations'],
    observations: JSON.parse(observations) as WorkspaceIndexes['observations'],
    gazetteer: JSON.parse(gazetteer) as WorkspaceIndexes['gazetteer'],
    mapFeatures: JSON.parse(mapFeatures) as WorkspaceIndexes['mapFeatures'],
  }));
  return workspaceIndexesPromise;
}

export async function GET(request: NextRequest) {
  const qid = request.nextUrl.searchParams.get('qid')?.trim().toUpperCase() ?? '';
  if (!/^Q\d+$/.test(qid)) {
    return NextResponse.json({ error: 'A valid Wikidata QID is required.' }, { status: 400 });
  }
  const organizationUri = `${organizationBase}${qid}`;
  const indexes = await loadWorkspaceIndexes();
  const plantations = Object.values(indexes.plantations).filter(
    (plantation) =>
      plantation.hasOrganizationalAssociation === organizationUri,
  );
  const gazetteerPlantations = (indexes.gazetteer['@graph'] ?? [])
    .filter((entry) => {
      if (entry.type !== 'plantation' || entry.deprecated || entry.mergedInto) {
        return false;
      }
      const links = Array.isArray(entry.externalLinks)
        ? (entry.externalLinks as Array<Record<string, unknown>>)
        : [];
      return links.some(
        (link) =>
          link.authority === 'wikidata' &&
          String(link.identifier).toUpperCase() === qid,
      );
    })
    .map((entry) => {
      const names = Array.isArray(entry.names)
        ? (entry.names as Array<Record<string, unknown>>)
        : [];
      const preferred =
        names.find((name) => name.isPreferred === true)?.text ??
        names[0]?.text ??
        entry.prefLabel ??
        entry.id;
      return {
        id: entry.id,
        prefLabel: String(preferred ?? qid),
        associationStatus: 'linked',
      };
    });
  if (gazetteerPlantations.length > 1) {
    for (const plantation of gazetteerPlantations) {
      plantation.associationStatus = 'needs-physical-link-review';
    }
  }
  const linkedPlantationUris = new Set(
    plantations.map((plantation) => plantation['@id']),
  );
  const explorePlantations = (indexes.mapFeatures.features ?? [])
    .map((feature) => feature.properties ?? {})
    .filter(
      (properties) =>
        properties.featureType === 'plantation' &&
        (linkedPlantationUris.has(properties.plantationUri) ||
          linkedPlantationUris.has(properties.featureUri)),
    )
    .map((properties) => ({
      id: properties.stmId,
      prefLabel: properties.name,
      featureUri: properties.plantationUri ?? properties.featureUri,
      associationStatus: properties.organizationAssociationStatus,
    }))
    .filter(
      (plantation, index, all) =>
        typeof plantation.id === 'string' &&
        all.findIndex((candidate) => candidate.id === plantation.id) === index,
    );
  return NextResponse.json({
    organizationUri,
    plantations,
    appellations: indexes.appellations[organizationUri] ?? [],
    observations: indexes.observations[organizationUri] ?? [],
    gazetteerPlantations,
    explorePlantations,
  });
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
  if (!(await hasRepoAccess(token))) {
    return {
      error: NextResponse.json(
        { error: 'You do not have edit permissions on this repository.' },
        { status: 403 },
      ),
    };
  }
  return { token };
}

function cleanLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map((label) => label.trim()).filter(Boolean))];
}

export async function POST(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const raw = (await request.json()) as Record<string, unknown>;
  const qid = typeof raw.qid === 'string' ? raw.qid.trim().toUpperCase() : '';
  if (!/^Q\d+$/.test(qid)) {
    return NextResponse.json({ error: 'A valid Wikidata QID is required.' }, { status: 400 });
  }
  const status =
    typeof raw.reviewStatus === 'string' && validStatuses.has(raw.reviewStatus)
      ? raw.reviewStatus
      : 'unreviewed';

  try {
    const { token } = auth;
    const [{ content, sha }, userResponse] = await Promise.all([
      readRepoFile(token, overridesPath),
      fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    const document = JSON.parse(content) as {
      '@graph'?: OrganizationAuthorityOverride[];
    };
    const entries = document['@graph'] ?? [];
    const now = new Date().toISOString().slice(0, 10);
    const user = (await userResponse.json()) as { login?: string };
    const entry: OrganizationAuthorityOverride = {
      '@id': `${organizationBase}${qid}#editorial-override`,
      '@type': 'OrganizationAuthorityOverride',
      qid,
      preferredLabel:
        typeof raw.preferredLabel === 'string'
          ? raw.preferredLabel.trim() || undefined
          : undefined,
      alternativeLabels: cleanLabels(raw.alternativeLabels),
      editorialNote:
        typeof raw.editorialNote === 'string'
          ? raw.editorialNote.trim() || undefined
          : undefined,
      reviewStatus: status as OrganizationAuthorityOverride['reviewStatus'],
      modifiedAt: now,
      modifiedBy: user.login ?? 'unknown',
    };
    const existingIndex = entries.findIndex((candidate) => candidate.qid === qid);
    if (existingIndex >= 0) entries[existingIndex] = entry;
    else entries.push(entry);
    entries.sort((a, b) => a.qid.localeCompare(b.qid, undefined, { numeric: true }));
    document['@graph'] = entries;

    const commit = await writeRepoFile(
      token,
      overridesPath,
      JSON.stringify(document, null, 2),
      sha,
      `Update plantation organization: ${qid}`,
    );
    return NextResponse.json({
      ok: true,
      organization: entry,
      publication: { state: 'pending-deployment', commit },
    });
  } catch (error) {
    console.error('Save organization error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save organization' },
      { status: 500 },
    );
  }
}
