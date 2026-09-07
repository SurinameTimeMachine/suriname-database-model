import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jsonld from 'jsonld';
import {
  buildReadablePlaceObject,
  placeProfileContext,
  type PlaceRecordDocument,
} from '../lib/place-profile';
import { BASE, buildContext } from './lod-context';

type JsonObject = Record<string, unknown>;
type IndexEntry = { id: string; label: string; type: string };

const RECORD_DIR = join(__dirname, '../public/data/place-records');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function strings(value: unknown): string[] {
  return values(value).filter((item): item is string => typeof item === 'string');
}

function profileIds(value: unknown): string[] {
  return values(value).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const id = (item as JsonObject).id;
    return typeof id === 'string' ? [id] : [];
  });
}

function sourceWkt(node: JsonObject | undefined): string | undefined {
  const value = node?.['geo:asWKT'];
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const literal = (value as JsonObject)['@value'];
  return typeof literal === 'string' ? literal : undefined;
}

function assertNoGraphOrSameAs(value: unknown, id: string) {
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoGraphOrSameAs(item, id));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert(key !== '@graph', `${id} profile contains a nested @graph`);
    assert(key !== 'sameAs' && key !== 'sdo:sameAs', `${id} profile introduces sameAs`);
    assertNoGraphOrSameAs(child, id);
  }
}

function sameValues(left: unknown[], right: unknown[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

async function main() {
  const index = JSON.parse(
    readFileSync(join(RECORD_DIR, 'index.json'), 'utf-8'),
  ) as IndexEntry[];
  assert(index.length > 0, 'No place records available for profile validation');

  const representativeByType = new Map<string, JsonObject>();
  for (const entry of index) {
    const document = JSON.parse(
      readFileSync(join(RECORD_DIR, `${entry.id}.jsonld`), 'utf-8'),
    ) as PlaceRecordDocument;
    const graph = document['@graph'] ?? [];
    const nodeById = new Map(
      graph.flatMap((node) =>
        typeof node['@id'] === 'string'
          ? [[node['@id'], node] as const]
          : [],
      ),
    );
    const pageId = `${BASE}place/${entry.id}`;
    const locationId = `${pageId}#location`;
    const featureId = `${pageId}#feature`;
    const location = nodeById.get(locationId);
    const feature = nodeById.get(featureId);
    assert(location, `${entry.id} source record has no location`);

    const profile = buildReadablePlaceObject(document);
    assertNoGraphOrSameAs(profile, entry.id);
    assert(
      profile['@context'] === placeProfileContext,
      `${entry.id} profile does not use the versioned STM context`,
    );
    assert(profile.id === locationId, `${entry.id} changed its Place identifier`);
    assert(profile.type === 'Place', `${entry.id} profile root is not a Place`);
    assert(
      typeof profile._label === 'string' && profile._label.length > 0,
      `${entry.id} profile has no display label`,
    );
    assert(
      profileIds(profile.documented_by).includes(`${pageId}#record`),
      `${entry.id} profile lost its authority-record link`,
    );
    assert(
      values(profile.classified_as).some(
        (item) =>
          profileIds(item)[0] ===
          `${BASE}vocabulary/place-type/${entry.type}`,
      ),
      `${entry.id} profile lost structural type ${entry.type}`,
    );

    const expectedNameIds = strings(location.P1_is_identified_by);
    const expectedIdentifierIds = strings(location.P48_has_preferred_identifier);
    const actualIdentifierIds = values(profile.identified_by).flatMap(profileIds);
    assert(
      sameValues(
        [...expectedNameIds, ...expectedIdentifierIds],
        actualIdentifierIds,
      ),
      `${entry.id} profile does not preserve names and identifiers`,
    );
    const expectedDescriptions = strings(location.P3_has_note);
    const actualDescriptions = values(profile.referred_to_by).flatMap(
      (item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? strings((item as JsonObject).content)
          : [],
    );
    assert(
      sameValues(expectedDescriptions, actualDescriptions),
      `${entry.id} profile does not preserve Place descriptions`,
    );

    const geometryId = strings(location['geo:hasGeometry'])[0];
    const expectedGeometry = sourceWkt(
      geometryId ? nodeById.get(geometryId) : undefined,
    );
    assert(
      profile.defined_by === expectedGeometry,
      `${entry.id} profile changed or promoted its geometry`,
    );
    const centroidId = strings(location['geo:hasCentroid'])[0];
    const expectedCentroid = sourceWkt(
      centroidId ? nodeById.get(centroidId) : undefined,
    );
    const centroid = profile.centroid as JsonObject | undefined;
    assert(
      centroidId
        ? centroid?.id === centroidId && centroid.as_wkt === expectedCentroid
        : centroid == null,
      `${entry.id} profile changed or lost its centroid`,
    );

    const relatedFeatures = values(profile.related_features);
    assert(
      feature ? profileIds(relatedFeatures[0])[0] === featureId : relatedFeatures.length === 0,
      `${entry.id} profile changed its physical-feature relation`,
    );
    const expectedParent = strings(location.P89_falls_within);
    const actualParent = values(profile.part_of).flatMap(profileIds);
    assert(
      sameValues(expectedParent, actualParent),
      `${entry.id} profile changed its containing place`,
    );
    const expectedSources = strings(location['prov:wasDerivedFrom']);
    const actualSources = values(profile.derived_from).flatMap(profileIds);
    assert(
      sameValues(expectedSources, actualSources),
      `${entry.id} profile changed its place provenance`,
    );

    const expectedPlaceAttributions = graph.filter((node) =>
      strings(node.P140_assigned_attribute_to).includes(locationId),
    ).length;
    const expectedPlaceClassifications = graph.filter((node) =>
      strings(node.P41_classified).includes(locationId),
    ).length;
    assert(
      values(profile.attributed_by).length === expectedPlaceAttributions,
      `${entry.id} profile lost a Place attribute assignment`,
    );
    assert(
      values(profile.classified_by).length === expectedPlaceClassifications,
      `${entry.id} profile lost a Place type assignment`,
    );

    if (feature) {
      const compactFeature = relatedFeatures[0] as JsonObject;
      const status = strings(feature.organizationAssociationStatus)[0];
      const expectedOrganizations =
        status === 'linked'
          ? strings(feature.hasOrganizationalAssociation)
          : [];
      const actualOrganizations = values(
        compactFeature.associated_organizations,
      ).flatMap(profileIds);
      assert(
        sameValues(expectedOrganizations, actualOrganizations),
        `${entry.id} profile publishes an unresolved organization link`,
      );
      assert(
        compactFeature.organization_association_status === status,
        `${entry.id} profile changed its organization review status`,
      );
      const expectedFeatureAttributions = graph.filter((node) =>
        strings(node.P140_assigned_attribute_to).includes(featureId),
      ).length;
      const expectedFeatureClassifications = graph.filter((node) =>
        strings(node.P41_classified).includes(featureId),
      ).length;
      assert(
        values(compactFeature.attributed_by).length ===
          expectedFeatureAttributions,
        `${entry.id} profile lost a feature attribute assignment`,
      );
      assert(
        values(compactFeature.classified_by).length ===
          expectedFeatureClassifications,
        `${entry.id} profile lost a feature type assignment`,
      );
    }

    if (!representativeByType.has(entry.type)) {
      representativeByType.set(entry.type, profile);
    }
  }

  for (const [type, profile] of representativeByType) {
    const expanded = (await jsonld.expand({
      ...profile,
      '@context': buildContext(),
    } as jsonld.JsonLdDocument)) as unknown[];
    assert(
      expanded.length === 1,
      `${type} profile does not expand from one root object`,
    );
  }

  console.log(
    `Place profile OK: ${index.length} Place objects across ${representativeByType.size} active types preserve stable IDs, names, geometry, feature links, assertions, and provenance without @graph or unresolved organization claims.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
