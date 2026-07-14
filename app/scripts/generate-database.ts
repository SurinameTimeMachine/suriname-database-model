/**
 * Generate JSON-LD database + GeoJSON map layer from transformed entities.
 *
 * Imports entity arrays from transform-plantations.ts and transform-almanakken.ts,
 * builds the full @graph with provenance, and writes:
 *   app/lod/database.jsonld
 *   app/lod/map-features.geojson
 *
 * No intermediate CSV files -- everything stays in memory.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  type AppellationRow,
  type ObservationRow,
  transformAlmanakken,
} from './transform-almanakken';
import {
  type E25Row,
  type E41Row,
  type E53Row,
  type MapLink,
  type SourceRow,
  transformPlantations,
} from './transform-plantations';
import {
  type E26E41Row,
  type E26E53Row,
  type E26Row,
  transformRivers,
} from './transform-rivers';
import { BASE, WD, buildContext, buildContextDocument } from './lod-context';

const LOD_DIR = join(__dirname, '../lod');
const ORGANIZATION_OVERRIDES_PATH = join(
  __dirname,
  '../../data/organization-authority-overrides.jsonld',
);
const GAZETTEER_PATH = join(
  __dirname,
  '../../data/places-gazetteer.jsonld',
);
mkdirSync(LOD_DIR, { recursive: true });

type OrganizationOverride = {
  qid?: string;
  preferredLabel?: string;
  alternativeLabels?: string[];
  editorialNote?: string;
  reviewStatus?: 'unreviewed' | 'reviewed' | 'disputed';
  physicalLinkReviewStatus?: 'confirmed-multiple';
  reviewedPhysicalPlaceIds?: string[];
  qidChangeReviewStatus?: 'confirmed-current';
  reviewedQidChangeTargets?: string[];
  modifiedAt?: string;
  modifiedBy?: string;
};

function readOrganizationOverrides(): Map<string, OrganizationOverride> {
  if (!existsSync(ORGANIZATION_OVERRIDES_PATH)) return new Map();
  const document = JSON.parse(
    readFileSync(ORGANIZATION_OVERRIDES_PATH, 'utf-8'),
  ) as { '@graph'?: OrganizationOverride[] };
  return new Map(
    (document['@graph'] ?? [])
      .filter((entry) => typeof entry.qid === 'string' && /^Q\d+$/.test(entry.qid))
      .map((entry) => [entry.qid!, entry]),
  );
}

function confirmedPhysicalLinkQids(
  overrides: Map<string, OrganizationOverride>,
): Set<string> {
  if (!existsSync(GAZETTEER_PATH)) return new Set();
  const document = JSON.parse(readFileSync(GAZETTEER_PATH, 'utf-8')) as {
    '@graph'?: Array<Record<string, unknown>>;
  };
  const activeIdsByQid = new Map<string, string[]>();
  for (const entry of document['@graph'] ?? []) {
    if (
      entry.type !== 'plantation' ||
      entry.deprecated ||
      entry.mergedInto ||
      typeof entry.id !== 'string'
    ) {
      continue;
    }
    const links = Array.isArray(entry.externalLinks)
      ? (entry.externalLinks as Array<Record<string, unknown>>)
      : [];
    const qid = links.find(
      (link) =>
        link.authority === 'wikidata' &&
        typeof link.identifier === 'string' &&
        /^Q\d+$/.test(link.identifier),
    )?.identifier as string | undefined;
    if (!qid) continue;
    activeIdsByQid.set(qid, [...(activeIdsByQid.get(qid) ?? []), entry.id]);
  }
  return new Set(
    [...overrides.entries()]
      .filter(([qid, override]) => {
        const activeIds = [...(activeIdsByQid.get(qid) ?? [])].sort();
        const reviewedIds = [...(override.reviewedPhysicalPlaceIds ?? [])].sort();
        return (
          override.physicalLinkReviewStatus === 'confirmed-multiple' &&
          activeIds.length > 1 &&
          activeIds.join('\u0000') === reviewedIds.join('\u0000')
        );
      })
      .map(([qid]) => qid),
  );
}

// --- Entity builders ---

function buildE22Sources(
  sources: SourceRow[],
  e36BySource: Map<string, string[]>,
  appellationsBySource: Map<string, string[]>,
): Record<string, unknown>[] {
  return sources.map((s) => {
    const entity: Record<string, unknown> = {
      '@id': s.uri,
      '@type': ['E22_Human_Made_Object'],
      prefLabel: s.label,
      P2_has_type: `${BASE}type/source-type/${s.type}`,
      mapId: s.id,
    };

    // P128 carries: visual items (E36) and appellations (E41)
    const carries: string[] = [
      ...(e36BySource.get(s.uri) ?? []),
      ...(appellationsBySource.get(s.uri) ?? []),
    ];
    if (carries.length > 0) {
      entity.P128_carries = carries.length === 1 ? carries[0] : carries;
    }
    if (s.year) entity.mapYear = s.year;
    if (s.source_url) entity.sameAs = s.source_url;
    // P108i: inverse link to E12 Production event
    entity.P108i_was_produced_by = `${BASE}production/${s.id.toLowerCase()}`;
    return entity;
  });
}

function buildE25Plantations(
  plantations: E25Row[],
  appellationIndex: Map<string, string[]>,
  mapLinkIndex: Map<string, MapLink[]>,
  organizationUriByQid: Map<string, string>,
  plantationUrisByQid: Map<string, string[]>,
  confirmedPhysicalLinks: Set<string>,
): {
  entities: Record<string, unknown>[];
  provenance: Record<string, unknown>[];
} {
  const entities: Record<string, unknown>[] = [];
  const provenance: Record<string, unknown>[] = [];

  for (const p of plantations) {
    const entity: Record<string, unknown> = {
      '@id': p.uri,
      '@type': ['E25_Human_Made_Feature', 'Plantation'],
      status: p.status,
      featureType: p.featureType,
    };

    // CRM alignment: P2 has type -> E55 Type (plantation status)
    if (p.status) {
      entity.P2_has_type = `${BASE}type/plantation-status/${p.status.toLowerCase()}`;
    }

    if (p.prefLabel) entity.prefLabel = p.prefLabel;
    const authorityMatches = [p.wikidata_qid, p.wikidata_alt_qid]
      .filter(Boolean)
      .map((qid) => `${WD}${qid}`);
    if (authorityMatches.length > 0) {
      entity.closeMatch =
        authorityMatches.length === 1 ? authorityMatches[0] : authorityMatches;
    }
    if (p.psur_ids.length > 0) {
      entity.psurId = p.psur_ids.length === 1 ? p.psur_ids[0] : p.psur_ids;
    }
    if (p.p53_place_uri) entity.P53_has_location = p.p53_place_uri;
    const organizationUri = organizationUriByQid.get(p.wikidata_qid);
    if (organizationUri) {
      entity.hasOrganizationalAssociation = organizationUri;
      const physicalLinkConfirmed = confirmedPhysicalLinks.has(
        p.wikidata_qid,
      );
      entity.organizationAssociationStatus =
        (plantationUrisByQid.get(p.wikidata_qid)?.length ?? 0) > 1 &&
        !physicalLinkConfirmed
          ? 'needs-physical-link-review'
          : 'linked';
    } else {
      entity.organizationAssociationStatus = 'needs-organization-link';
    }

    const appUris = appellationIndex.get(p.uri) ?? [];
    if (appUris.length > 0) {
      entity.P1_is_identified_by = appUris.length === 1 ? appUris[0] : appUris;
    }

    const maps = mapLinkIndex.get(p.uri) ?? [];
    if (maps.length > 0) {
      // depictedOnMap for frontend compatibility
      entity['depictedOnMap'] = maps.map((m) => ({
        mapId: m.map_id,
        labelOnMap: m.label_on_map,
        hasPolygon: m.has_polygon === 'true',
        P70i_is_documented_in: m.map_uri,
      }));
      // CRM alignment: P138i has representation -> E36 Visual Items
      const e36Uris = [
        ...new Set(
          maps.map((m) => {
            const slug = p.uri.split('/').pop() ?? 'unknown';
            return `${BASE}visual-item/${m.map_id}-${slug}`;
          }),
        ),
      ];
      entity.P138i_has_representation =
        e36Uris.length === 1 ? e36Uris[0] : e36Uris;
    }

    const provId = `${BASE}provenance/e25-${p.slug}`;
    entity.wasDerivedFrom = provId;
    provenance.push({
      '@id': provId,
      '@type': ['ProvenanceRecord'],
      sourceFile:
        'data/07-gis-plantation-map-1930/plantation_polygons_1930.csv',
      sourceColumn: 'plantation_label, qid, coords',
      sourceRow: `fid=${p.fid}`,
      transformedBy: 'scripts/transform-plantations.ts',
      modelEntity: 'E25_Human-Made_Feature',
      schemaTable: 'e25_human_made_features',
      linkedVia: `qid -> skos:closeMatch -> wd:${p.wikidata_qid}`,
    });

    entities.push(entity);
  }

  return { entities, provenance };
}

function buildE74Organizations(
  plantations: E25Row[],
  observations: ObservationRow[],
  appellationIndex: Map<string, string[]>,
  overrides: Map<string, OrganizationOverride>,
): {
  entities: Record<string, unknown>[];
  provenance: Record<string, unknown>[];
  uriByQid: Map<string, string>;
} {
  const namesByQid = new Map<string, Map<string, number>>();
  const psurByQid = new Map<string, Set<string>>();

  const addName = (qid: string, name: string) => {
    if (!qid || !name.trim()) return;
    const names = namesByQid.get(qid) ?? new Map<string, number>();
    names.set(name.trim(), (names.get(name.trim()) ?? 0) + 1);
    namesByQid.set(qid, names);
  };
  const addPsur = (qid: string, value: string) => {
    if (!qid || !value.trim()) return;
    const identifiers = psurByQid.get(qid) ?? new Set<string>();
    for (const id of value.split(/[;,]/).map((part) => part.trim()).filter(Boolean)) {
      identifiers.add(id);
    }
    psurByQid.set(qid, identifiers);
  };

  for (const plantation of plantations) {
    if (!plantation.wikidata_qid) continue;
    addName(plantation.wikidata_qid, plantation.prefLabel);
    for (const id of plantation.psur_ids) addPsur(plantation.wikidata_qid, id);
  }
  for (const observation of observations) {
    if (!observation.plantation_qid) continue;
    addName(
      observation.plantation_qid,
      observation.standardized_name || observation.observed_name,
    );
    addName(observation.plantation_qid, observation.observed_name);
    addPsur(observation.plantation_qid, observation.psur_id);
  }

  const qids = [...new Set([...namesByQid.keys(), ...psurByQid.keys()])].sort();
  const uriByQid = new Map(qids.map((qid) => [qid, `${BASE}organization/${qid}`]));
  const provenance: Record<string, unknown>[] = [];
  const entities = qids.map((qid) => {
    const uri = uriByQid.get(qid)!;
    const names = [...(namesByQid.get(qid)?.entries() ?? [])].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    const identifiers = [...(psurByQid.get(qid) ?? [])].sort();
    const appUris = appellationIndex.get(uri) ?? [];
    const provId = `${BASE}provenance/e74-${qid.toLowerCase()}`;
    const entity: Record<string, unknown> = {
      '@id': uri,
      '@type': ['E74_Group'],
      prefLabel: names[0]?.[0] ?? qid,
      exactMatch: `${WD}${qid}`,
      wasDerivedFrom: provId,
    };
    const override = overrides.get(qid);
    if (override?.preferredLabel?.trim()) {
      entity.prefLabel = override.preferredLabel.trim();
    }
    const alternativeLabels = (override?.alternativeLabels ?? [])
      .map((label) => label.trim())
      .filter(Boolean);
    if (alternativeLabels.length > 0) {
      entity.altLabel = alternativeLabels;
    }
    if (override?.editorialNote?.trim()) {
      entity.editorialNote = override.editorialNote.trim();
    }
    entity.authorityReviewStatus = override?.reviewStatus ?? 'unreviewed';
    if (override?.modifiedAt) entity.modifiedAt = override.modifiedAt;
    if (override?.modifiedBy) entity.modifiedBy = override.modifiedBy;
    if (override?.physicalLinkReviewStatus) {
      entity.physicalLinkReviewStatus = override.physicalLinkReviewStatus;
    }
    if (override?.reviewedPhysicalPlaceIds?.length) {
      entity.reviewedPhysicalPlaceIds = override.reviewedPhysicalPlaceIds;
    }
    if (override?.qidChangeReviewStatus) {
      entity.qidChangeReviewStatus = override.qidChangeReviewStatus;
    }
    if (override?.reviewedQidChangeTargets?.length) {
      entity.reviewedQidChangeTargets = override.reviewedQidChangeTargets;
    }
    if (identifiers.length > 0) {
      entity.psurId = identifiers.length === 1 ? identifiers[0] : identifiers;
    }
    if (appUris.length > 0) {
      entity.P1_is_identified_by = appUris.length === 1 ? appUris[0] : appUris;
    }
    provenance.push({
      '@id': provId,
      '@type': ['ProvenanceRecord'],
      sourceFile:
        'data/06-almanakken - Plantations Surinaamse Almanakken/Plantations Surinaamse Almanakken v2.0 (1).csv; data/07-gis-plantation-map-1930/plantation_polygons_1930.csv',
      sourceColumn: 'plantation_id/qid, plantation_std/plantation_org',
      sourceRow: `plantation_id=${qid}`,
      transformedBy: 'scripts/generate-database.ts',
      modelEntity: 'E74_Group',
      schemaTable: 'organizations',
      linkedVia: `plantation_id -> skos:exactMatch -> wd:${qid}`,
    });
    return entity;
  });

  return { entities, provenance, uriByQid };
}

function buildE26PhysicalFeatures(
  features: E26Row[],
  appellationIndex: Map<string, string[]>,
): {
  entities: Record<string, unknown>[];
  provenance: Record<string, unknown>[];
} {
  const entities: Record<string, unknown>[] = [];
  const provenance: Record<string, unknown>[] = [];
  const VOCAB_BASE = `${BASE}vocabulary/geographical-feature/natural`;

  for (const f of features) {
    const entity: Record<string, unknown> = {
      '@id': f.uri,
      '@type': ['E26_Physical_Feature'],
      featureType: f.featureType,
      P2_has_type: `${VOCAB_BASE}/${f.featureType}`,
    };

    if (f.prefLabel) entity.prefLabel = f.prefLabel;
    if (f.p53_place_uri) entity.P53_has_location = f.p53_place_uri;
    if (f.mainBodyWater) entity.mainBodyWater = f.mainBodyWater;

    const appUris = appellationIndex.get(f.uri) ?? [];
    if (appUris.length > 0) {
      entity.P1_is_identified_by = appUris.length === 1 ? appUris[0] : appUris;
    }

    const provId = `${BASE}provenance/e26-${f.slug}`;
    entity.wasDerivedFrom = provId;
    provenance.push({
      '@id': provId,
      '@type': ['ProvenanceRecord'],
      sourceFile: 'data/07-gis-plantation-map-1930/rivers.csv',
      sourceColumn: 'label1930, main_body_water, wkt_geometry',
      sourceRow: `fid=${f.fid}`,
      transformedBy: 'scripts/transform-rivers.ts',
      modelEntity: 'E26_Physical_Feature',
      schemaTable: 'e26_physical_features',
      linkedVia: `P2_has_type -> ${VOCAB_BASE}/${f.featureType}`,
    });

    entities.push(entity);
  }

  return { entities, provenance };
}

function buildE53Places(places: E53Row[]): {
  entities: Record<string, unknown>[];
  provenance: Record<string, unknown>[];
} {
  const entities: Record<string, unknown>[] = [];
  const provenance: Record<string, unknown>[] = [];

  for (const pl of places) {
    const entity: Record<string, unknown> = {
      '@id': pl.uri,
      '@type': ['E53_Place'],
      fid: parseInt(pl.fid) || null,
      mapYear: pl.map_year,
    };

    if (pl.observed_label) entity.observedLabel = pl.observed_label;

    if (pl.coords_wgs84) {
      entity.hasGeometry = {
        '@type': 'geo:Geometry',
        asWKT: pl.coords_wgs84,
        geometrySource: pl.source_uri,
      };
    }

    if (pl.source_uri) entity.P70i_is_documented_in = pl.source_uri;

    const provId = `${BASE}provenance/e53-fid-${pl.fid}`;
    entity.wasDerivedFrom = provId;
    provenance.push({
      '@id': provId,
      '@type': ['ProvenanceRecord'],
      sourceFile:
        'data/07-gis-plantation-map-1930/plantation_polygons_1930.csv',
      sourceColumn: 'coords (EPSG:32621 -> EPSG:4326)',
      sourceRow: `fid=${pl.fid}`,
      transformedBy: 'scripts/transform-plantations.ts (proj4 reprojection)',
      modelEntity: 'E53_Place',
      schemaTable: 'e53_places',
      linkedVia: `P53i_is_location_of -> ${pl.plantation_uri}`,
    });

    entities.push(entity);
  }

  return { entities, provenance };
}

function buildE53RiverPlaces(places: E26E53Row[]): {
  entities: Record<string, unknown>[];
  provenance: Record<string, unknown>[];
} {
  const entities: Record<string, unknown>[] = [];
  const provenance: Record<string, unknown>[] = [];

  for (const pl of places) {
    const entity: Record<string, unknown> = {
      '@id': pl.uri,
      '@type': ['E53_Place'],
      fid: parseInt(pl.fid) || null,
      mapYear: pl.map_year,
    };

    if (pl.observed_label) entity.observedLabel = pl.observed_label;

    if (pl.coords_wgs84) {
      entity.hasGeometry = {
        '@type': 'geo:Geometry',
        asWKT: pl.coords_wgs84,
        geometrySource: pl.source_uri,
      };
    }

    if (pl.source_uri) entity.P70i_is_documented_in = pl.source_uri;

    const provId = `${BASE}provenance/e53-river-fid-${pl.fid}`;
    entity.wasDerivedFrom = provId;
    provenance.push({
      '@id': provId,
      '@type': ['ProvenanceRecord'],
      sourceFile: 'data/07-gis-plantation-map-1930/rivers.csv',
      sourceColumn: 'wkt_geometry (EPSG:31170 -> EPSG:4326)',
      sourceRow: `fid=${pl.fid}`,
      transformedBy: 'scripts/transform-rivers.ts (proj4 reprojection)',
      modelEntity: 'E53_Place',
      schemaTable: 'e53_places',
      linkedVia: `P53i_is_location_of -> ${pl.feature_uri}`,
    });

    entities.push(entity);
  }

  return { entities, provenance };
}

function buildE41Appellations(
  appellations: (E41Row | AppellationRow)[],
): Record<string, unknown>[] {
  return appellations.map((a) => {
    const entity: Record<string, unknown> = {
      '@id': a.uri,
      '@type': ['E41_Appellation'],
      P190_has_symbolic_content: a.symbolic_content,
    };

    if (a.language) entity.P72_has_language = a.language;
    if (a.carried_by) entity.P128i_is_carried_by = a.carried_by;
    if (a.identifies_uri) entity.P1i_identifies = a.identifies_uri;
    if (a.alt_form_of) entity.P139_has_alternative_form = a.alt_form_of;
    if (a.source_year) entity.mapYear = a.source_year;

    return entity;
  });
}

// --- Structural entity builders ---

function buildE36VisualItems(mapLinks: MapLink[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const entities: Record<string, unknown>[] = [];
  for (const m of mapLinks) {
    const slug = m.plantation_uri.split('/').pop() ?? 'unknown';
    const id = `${BASE}visual-item/${m.map_id}-${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);
    entities.push({
      '@id': id,
      '@type': ['E36_Visual_Item'],
      P138_represents: m.plantation_uri,
      P128i_is_carried_by: m.map_uri,
      labelOnMap: m.label_on_map,
      hasPolygon: m.has_polygon === 'true',
    });
  }
  return entities;
}

function buildE55Types(): Record<string, unknown>[] {
  const types: {
    uri: string;
    label: string;
    broader?: string;
  }[] = [
    // Plantation status vocabulary
    {
      uri: `${BASE}type/plantation-status`,
      label: 'Plantation status',
    },
    {
      uri: `${BASE}type/plantation-status/built`,
      label: 'Built',
      broader: `${BASE}type/plantation-status`,
    },
    {
      uri: `${BASE}type/plantation-status/planned`,
      label: 'Planned',
      broader: `${BASE}type/plantation-status`,
    },
    {
      uri: `${BASE}type/plantation-status/abandoned`,
      label: 'Abandoned',
      broader: `${BASE}type/plantation-status`,
    },
    {
      uri: `${BASE}type/plantation-status/unknown`,
      label: 'Unknown',
      broader: `${BASE}type/plantation-status`,
    },
    // Source type vocabulary
    { uri: `${BASE}type/source-type/map`, label: 'Map' },
    { uri: `${BASE}type/source-type/almanac`, label: 'Almanac' },
    { uri: `${BASE}type/source-type/register`, label: 'Register' },
    // Product types
    { uri: `${BASE}type/product/sugar`, label: 'Sugar' },
    { uri: `${BASE}type/product/coffee`, label: 'Coffee' },
    { uri: `${BASE}type/product/cacao`, label: 'Cacao' },
    { uri: `${BASE}type/product/cotton`, label: 'Cotton' },
    { uri: `${BASE}type/product/wood`, label: 'Wood' },
    { uri: `${BASE}type/certainty/probable`, label: 'Probable' },
    {
      uri: `${BASE}type/population/enslaved`,
      label: 'Enslaved population',
    },
    // Natural-feature vocabulary used by E26 records
    {
      uri: `${BASE}vocabulary/geographical-feature/natural/river`,
      label: 'River',
    },
    {
      uri: `${BASE}vocabulary/geographical-feature/natural/creek`,
      label: 'Creek',
    },
  ];

  return types.map((t) => {
    const entity: Record<string, unknown> = {
      '@id': t.uri,
      '@type': ['E55_Type'],
      prefLabel: t.label,
    };
    if (t.broader) {
      entity['skos:broader'] = t.broader;
    }
    return entity;
  });
}

function buildInferenceRules(): Record<string, unknown>[] {
  return [
    {
      '@id': `${BASE}rule/enslaved-population-presence-at-matched-plantation`,
      '@type': ['InferenceRule'],
      prefLabel: 'Enslaved population presence at matched plantation',
      'dcterms:description':
        'A positive Almanakken enslaved-person count about a plantation organization supports probable presence at the uniquely matched physical plantation, unless the source states that the population was shared with another plantation.',
    },
  ];
}

function buildE52TimeSpans(years: Set<string>): Record<string, unknown>[] {
  return Array.from(years)
    .filter(Boolean)
    .sort()
    .map((year) => ({
      '@id': `${BASE}timespan/${year}`,
      '@type': ['E52_Time_Span'],
      prefLabel: year,
      P82a_begin_of_the_begin: `${year}-01-01`,
      P82b_end_of_the_end: `${year}-12-31`,
    }));
}

function buildE12Productions(sources: SourceRow[]): Record<string, unknown>[] {
  return sources.map((s) => {
    const entity: Record<string, unknown> = {
      '@id': `${BASE}production/${s.id.toLowerCase()}`,
      '@type': ['E12_Production'],
      prefLabel: `Production of ${s.label}`,
      P108_has_produced: s.uri,
    };
    if (s.maker) entity.sourceMaker = s.maker;
    if (s.publication_place) entity.publicationPlace = s.publication_place;
    if (s.year) entity.P4_has_time_span = `${BASE}timespan/${s.year}`;
    return entity;
  });
}

function buildE36Images(sources: SourceRow[]): Record<string, unknown>[] {
  const entities: Record<string, unknown>[] = [];
  for (const s of sources) {
    if (!s.iiif_info_url && !s.iiif_manifest) continue;
    const entity: Record<string, unknown> = {
      '@id': `${BASE}image/${s.id.toLowerCase()}`,
      '@type': ['E36_Visual_Item'],
      prefLabel: `Digital scan of ${s.label}`,
      P138_represents: s.uri,
    };
    if (s.iiif_info_url) entity.contentUrl = s.iiif_info_url;
    if (s.iiif_manifest) entity.sameAs = s.iiif_manifest;
    if (s.holding_archive) entity.holdingArchive = s.holding_archive;
    if (s.handle_url) entity['dcterms:identifier'] = s.handle_url;
    entities.push(entity);
  }
  return entities;
}

function buildObservations(
  obs: ObservationRow[],
  organizationUriByQid: Map<string, string>,
  plantationUriByQid: Map<string, string>,
  placeUriByPlantationUri: Map<string, string>,
): {
  entities: Record<string, unknown>[];
  inferences: Record<string, unknown>[];
  provenance: Record<string, unknown>[];
  observationYears: Set<string>;
  resolvedTargets: number;
} {
  const entities: Record<string, unknown>[] = [];
  const inferences: Record<string, unknown>[] = [];
  const provenance: Record<string, unknown>[] = [];
  const seenYears = new Set<string>();
  const observationYears = new Set<string>();
  let resolvedTargets = 0;

  for (const o of obs) {
    // Type: E13_Attribute_Assignment
    const entity: Record<string, unknown> = {
      '@id': o.uri,
      '@type': ['E13_Attribute_Assignment'],
    };

    // CRM properties
    if (o.plantation_qid) {
      entity.sourcePlantationQid = o.plantation_qid;
    }
    const organizationUri = organizationUriByQid.get(o.plantation_qid);
    if (organizationUri) {
      entity.observationOf = organizationUri;
      // CRM alignment: P140 assigned attribute to
      entity.P140_assigned_attribute_to = organizationUri;
      resolvedTargets++;
    }
    if (o.observation_year) {
      entity.observationYear = o.observation_year;
      observationYears.add(o.observation_year);
      // CRM alignment: P4 has time-span -> E52
      entity.P4_has_time_span = `${BASE}timespan/${o.observation_year}`;
    }
    if (o.observed_name) entity.observedName = o.observed_name;
    if (o.sranantongo_name) entity.sranantongoName = o.sranantongo_name;
    if (o.owner) entity.hasOwner = o.owner;
    if (o.administrator) entity.hasAdministrator = o.administrator;
    if (o.director) entity.hasDirector = o.director;
    if (o.product) entity.product = o.product;
    const enslavedCount = parseInt(o.enslaved_count);
    if (!isNaN(enslavedCount)) entity.enslavedCount = enslavedCount;
    const privateEnslavedCount = parseInt(o.private_enslaved_count);
    if (!isNaN(privateEnslavedCount)) {
      entity.privateEnslavedCount = privateEnslavedCount;
    }
    const explicitPlantationCount = parseInt(
      o.explicit_plantation_enslaved_count,
    );
    if (!isNaN(explicitPlantationCount)) {
      entity.explicitPlantationEnslavedCount = explicitPlantationCount;
    }
    const freeResidentsCount = parseInt(o.free_residents);
    if (!isNaN(freeResidentsCount)) entity.freeResidentsCount = freeResidentsCount;
    if (o.is_deserted) entity.deserted = true;
    if (o.location_std) entity.locationStd = o.location_std;
    if (o.size_akkers) {
      const n = parseInt(o.size_akkers);
      if (!isNaN(n)) entity.sizeAkkers = n;
    }
    if (o.page_reference) entity.pageReference = o.page_reference;
    if (o.source_uri) entity.hadPrimarySource = o.source_uri;
    const splitIds = [o.split1_id, o.split2_id, o.split3_id, o.split4_id].filter(
      Boolean,
    );
    const splitLabels = [
      o.split1_lab,
      o.split2_lab,
      o.split3_lab,
      o.split4_lab,
    ].filter(Boolean);
    if (splitIds.length > 0) {
      entity.hasParts = splitIds.map((id) => `${WD}${id}`);
      entity.mergedInto = `${WD}${splitIds[0]}`;
    }
    if (splitLabels.length > 0) entity.hasPartLabels = splitLabels;
    if (o.partof_id) entity.partOf = `${WD}${o.partof_id}`;
    if (o.partof_lab) entity.partOfLabel = o.partof_lab;
    if (o.owned_by_id || o.owned_by_id2) {
      entity.ownedBy = [o.owned_by_id, o.owned_by_id2]
        .filter(Boolean)
        .map((id) => `${WD}${id}`);
    }
    if (o.enslaved_shared_with) {
      entity.enslavedSharedWith = o.enslaved_shared_with;
    }

    const plantationUri = plantationUriByQid.get(o.plantation_qid);
    const inferredPopulationCount =
      Number.isFinite(explicitPlantationCount) && explicitPlantationCount > 0
        ? explicitPlantationCount
        : enslavedCount;
    if (!organizationUri) {
      entity.presenceInferenceStatus = 'unresolved-organization';
    } else if (
      !Number.isFinite(inferredPopulationCount) ||
      inferredPopulationCount <= 0
    ) {
      entity.presenceInferenceStatus = 'not-applicable-no-positive-count';
    } else if (o.enslaved_shared_with) {
      entity.presenceInferenceStatus = 'suppressed-shared-population';
    } else if (
      Number.isFinite(privateEnslavedCount) &&
      privateEnslavedCount > 0 &&
      !(Number.isFinite(explicitPlantationCount) && explicitPlantationCount > 0)
    ) {
      entity.presenceInferenceStatus = 'suppressed-private-assignment';
    } else if (!plantationUri) {
      entity.presenceInferenceStatus = 'unresolved-physical-plantation';
    } else {
      const inferenceUri = `${BASE}inference/presence/${o.record_id}`;
      entity.presenceInferenceStatus = 'inferred-probable';
      entity.hasDerivedInference = inferenceUri;
      const inference: Record<string, unknown> = {
        '@id': inferenceUri,
        '@type': ['PresenceInference'],
        inferredPopulationAssociatedWith: organizationUri,
        inferredPresenceAt: plantationUri,
        populationCategory: `${BASE}type/population/enslaved`,
        populationCount: inferredPopulationCount,
        certainty: `${BASE}type/certainty/probable`,
        inferenceRule: `${BASE}rule/enslaved-population-presence-at-matched-plantation`,
        wasDerivedFrom: o.uri,
      };
      const placeUri = placeUriByPlantationUri.get(plantationUri);
      if (placeUri) inference.inferredPlace = placeUri;
      if (o.source_uri) inference.hadPrimarySource = o.source_uri;
      if (o.observation_year) {
        inference.P4_has_time_span = `${BASE}timespan/${o.observation_year}`;
      }
      inferences.push(inference);
    }

    const year = o.observation_year;
    const provId = `${BASE}provenance/obs-almanac-${year}`;
    entity.wasDerivedFrom = provId;

    if (year && !seenYears.has(year)) {
      seenYears.add(year);
      provenance.push({
        '@id': provId,
        '@type': ['ProvenanceRecord'],
        sourceFile:
          'data/06-almanakken - Plantations Surinaamse Almanakken/Plantations Surinaamse Almanakken v2.0 (1).csv',
        sourceColumn:
          'recordid, plantation_id, year, eigenaren, enslaved_norm/slaven, product_std, has_parts*, part_of_id, owned_by_id, sranantongo_naam',
        sourceRow: `year=${year}`,
        transformedBy: 'scripts/transform-almanakken.ts',
        modelEntity: 'E13_Attribute_Assignment / OrganizationObservation',
        schemaTable: 'observations',
        linkedVia: 'plantation_id -> P140/observationOf -> local E74 organization',
      });
    }

    entities.push(entity);
  }

  return { entities, inferences, provenance, observationYears, resolvedTargets };
}

// --- WKT to GeoJSON ---

function wktToGeoJsonCoords(wkt: string): number[][][] | null {
  const match = wkt.match(/Polygon\s*\(\((.+?)\)\)/i);
  if (!match) return null;

  const ring: number[][] = [];
  for (const pair of match[1].split(',')) {
    const parts = pair.trim().split(/\s+/);
    if (parts.length >= 2) {
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!isNaN(lon) && !isNaN(lat)) ring.push([lon, lat]);
    }
  }

  return ring.length >= 4 ? [ring] : null;
}

function wktLineStringToCoords(wkt: string): number[][] | null {
  const match = wkt.match(/LineString\s*\((.+?)\)/i);
  if (!match) return null;

  const coords: number[][] = [];
  for (const pair of match[1].split(',')) {
    const parts = pair.trim().split(/\s+/);
    if (parts.length >= 2) {
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!isNaN(lon) && !isNaN(lat)) coords.push([lon, lat]);
    }
  }

  return coords.length >= 2 ? coords : null;
}

function buildGeoJson(
  places: E53Row[],
  plantationMap: Map<string, E25Row>,
  riverPlaces: E26E53Row[],
  riverMap: Map<string, E26Row>,
  plantationNames: Map<string, string[]>,
  riverNames: Map<string, string[]>,
): Record<string, unknown> {
  const features: Record<string, unknown>[] = [];

  // Plantation polygons
  for (const pl of places) {
    if (!pl.coords_wgs84) continue;
    const coords = wktToGeoJsonCoords(pl.coords_wgs84);
    if (!coords) continue;

    const plantation = plantationMap.get(pl.plantation_uri);
    const preferredName = plantation?.prefLabel ?? pl.observed_label;
    const allNames = [
      ...new Set([
        ...(preferredName ? [preferredName] : []),
        ...(plantationNames.get(pl.plantation_uri) ?? []),
      ]),
    ];

    features.push({
      type: 'Feature',
      id: `plantation-${pl.fid}`,
      geometry: { type: 'Polygon', coordinates: coords },
      properties: {
        fid: parseInt(pl.fid) || null,
        name: preferredName,
        allNames,
        status: plantation?.status ?? 'unknown',
        featureType: 'plantation',
        mapYear: pl.map_year,
        plantationUri: pl.plantation_uri,
        wikidataQid: plantation?.wikidata_qid ?? '',
        placeUri: pl.uri,
      },
    });
  }

  // River/creek LineStrings
  for (const rp of riverPlaces) {
    if (!rp.coords_wgs84) continue;
    const coords = wktLineStringToCoords(rp.coords_wgs84);
    if (!coords) continue;

    const river = riverMap.get(rp.feature_uri);
    const preferredName = river?.prefLabel ?? rp.observed_label;
    const allNames = [
      ...new Set([
        ...(preferredName ? [preferredName] : []),
        ...(riverNames.get(rp.feature_uri) ?? []),
      ]),
    ];

    features.push({
      type: 'Feature',
      id: `river-${rp.fid}`,
      geometry: { type: 'LineString', coordinates: coords },
      properties: {
        fid: parseInt(rp.fid) || null,
        name: preferredName,
        allNames,
        status: 'natural',
        featureType: river?.featureType ?? 'river',
        mapYear: rp.map_year,
        featureUri: rp.feature_uri,
        mainBodyWater: river?.mainBodyWater ?? '',
        placeUri: rp.uri,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    name: 'Suriname Time Machine - Geographical Features',
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:EPSG::4326' },
    },
    features,
  };
}

// --- Main ---

function main() {
  console.log('=== Generating JSON-LD Database + GeoJSON ===\n');

  // Run transforms
  console.log('--- Transform: Plantations ---');
  const plantResult = transformPlantations();
  console.log('\n--- Transform: Rivers ---');
  const riverResult = transformRivers();
  console.log('\n--- Transform: Almanakken ---');
  const almResult = transformAlmanakken();

  // Merge sources
  const allSources = [...plantResult.sources, ...almResult.sources];

  // Build indexes
  const mapLinkIndex = new Map<string, MapLink[]>();
  for (const m of plantResult.mapLinks) {
    const list = mapLinkIndex.get(m.plantation_uri) ?? [];
    list.push(m);
    mapLinkIndex.set(m.plantation_uri, list);
  }

  const plantationMap = new Map<string, E25Row>();
  for (const p of plantResult.e25) {
    plantationMap.set(p.uri, p);
  }

  const riverMap = new Map<string, E26Row>();
  for (const r of riverResult.e26) {
    riverMap.set(r.uri, r);
  }

  const plantationUrisByQid = new Map<string, string[]>();
  for (const plantation of plantResult.e25) {
    if (!plantation.wikidata_qid) continue;
    plantationUrisByQid.set(plantation.wikidata_qid, [
      ...(plantationUrisByQid.get(plantation.wikidata_qid) ?? []),
      plantation.uri,
    ]);
  }
  const unambiguousPlantationUriByQid = new Map(
    [...plantationUrisByQid.entries()]
      .filter(([, uris]) => uris.length === 1)
      .map(([qid, uris]) => [qid, uris[0]]),
  );
  const organizationQids = new Set([
    ...plantResult.e25.map((plantation) => plantation.wikidata_qid),
    ...almResult.observations.map((observation) => observation.plantation_qid),
  ].filter(Boolean));
  const organizationUriByQid = new Map(
    [...organizationQids].map((qid) => [qid, `${BASE}organization/${qid}`]),
  );
  const organizationOverrides = readOrganizationOverrides();
  const confirmedPhysicalLinks = confirmedPhysicalLinkQids(
    organizationOverrides,
  );
  const almanacAppellations = almResult.appellations.map((appellation) => {
    const authorityUri = Array.isArray(appellation.identifies_uri)
      ? appellation.identifies_uri[0] ?? ''
      : appellation.identifies_uri;
    const qid = authorityUri.replace(
      /^https?:\/\/www\.wikidata\.org\/entity\//,
      '',
    );
    const organizationUri = organizationUriByQid.get(qid);
    const plantationUri = unambiguousPlantationUriByQid.get(qid);
    const targets = [organizationUri, plantationUri].filter(
      (uri): uri is string => Boolean(uri),
    );
    return {
      ...appellation,
      identifies_uri: targets.length === 1 ? targets[0] : targets,
      identifies_type: plantationUri ? 'E74+E25' : 'E74',
    };
  });
  const allAppellations = [
    ...plantResult.e41,
    ...almanacAppellations,
    ...riverResult.e41,
  ];
  const appellationIndex = new Map<string, string[]>();
  for (const appellation of allAppellations) {
    const targets = Array.isArray(appellation.identifies_uri)
      ? appellation.identifies_uri
      : [appellation.identifies_uri];
    for (const target of targets) {
      if (!target) continue;
      appellationIndex.set(target, [
        ...(appellationIndex.get(target) ?? []),
        appellation.uri,
      ]);
    }
  }

  // Build indexes for E22 P128 carries
  const e36BySource = new Map<string, string[]>();
  const appellationsBySource = new Map<string, string[]>();

  // Build E36 visual items from map links
  const allMapLinks = plantResult.mapLinks;
  const e36Entities = buildE36VisualItems(allMapLinks);

  // Index E36 by source URI
  for (const m of allMapLinks) {
    const slug = m.plantation_uri.split('/').pop() ?? 'unknown';
    const e36Uri = `${BASE}visual-item/${m.map_id}-${slug}`;
    const list = e36BySource.get(m.map_uri) ?? [];
    list.push(e36Uri);
    e36BySource.set(m.map_uri, list);
  }

  // Index appellations by source URI (for P128 carries)
  for (const a of [
    ...plantResult.e41,
    ...almResult.appellations,
    ...riverResult.e41,
  ]) {
    if (a.carried_by) {
      const list = appellationsBySource.get(a.carried_by) ?? [];
      list.push(a.uri);
      appellationsBySource.set(a.carried_by, list);
    }
  }

  // Build entities
  console.log('\n--- Building JSON-LD entities ---');
  const e22 = buildE22Sources(allSources, e36BySource, appellationsBySource);
  console.log(`  E22 Sources:        ${e22.length}`);

  const e25Result = buildE25Plantations(
    plantResult.e25,
    appellationIndex,
    mapLinkIndex,
    organizationUriByQid,
    plantationUrisByQid,
    confirmedPhysicalLinks,
  );
  console.log(`  E25 Plantations:    ${e25Result.entities.length}`);

  const e26Result = buildE26PhysicalFeatures(riverResult.e26, appellationIndex);
  console.log(`  E26 Rivers/Creeks:  ${e26Result.entities.length}`);

  const e53Result = buildE53Places(plantResult.e53);
  const e53RiverResult = buildE53RiverPlaces(riverResult.e53);
  console.log(
    `  E53 Places:         ${e53Result.entities.length + e53RiverResult.entities.length} (${e53Result.entities.length} plantation, ${e53RiverResult.entities.length} river)`,
  );

  const organizationResult = buildE74Organizations(
    plantResult.e25,
    almResult.observations,
    appellationIndex,
    organizationOverrides,
  );
  console.log(`  E74 Organizations: ${organizationResult.entities.length}`);

  const e41All = buildE41Appellations(allAppellations);
  console.log(`  E41 Appellations:   ${e41All.length}`);

  const obsResult = buildObservations(
    almResult.observations,
    organizationResult.uriByQid,
    unambiguousPlantationUriByQid,
    new Map(plantResult.e53.map((place) => [place.plantation_uri, place.uri])),
  );
  console.log(
    `  Observations:       ${obsResult.entities.length} E13 (${obsResult.resolvedTargets} with local E74 targets)`,
  );
  console.log(`  Presence inferences:${obsResult.inferences.length}`);

  // Structural entities
  console.log(`  E36 Visual Items:   ${e36Entities.length}`);

  const e55Types = buildE55Types();
  console.log(`  E55 Types:          ${e55Types.length}`);

  const e52TimeSpans = buildE52TimeSpans(
    new Set([
      ...obsResult.observationYears,
      ...allSources.map((source) => source.year).filter(Boolean),
    ]),
  );
  console.log(`  E52 Time-Spans:     ${e52TimeSpans.length}`);

  // E12 Production events: who made each source, where, when
  const e12Productions = buildE12Productions(allSources);
  console.log(`  E12 Productions:    ${e12Productions.length}`);

  // E36 Visual Item entities: IIIF digital reproductions
  const e36Images = buildE36Images(allSources);
  console.log(`  E36 Images:         ${e36Images.length}`);

  const allProv = [
    ...e25Result.provenance,
    ...organizationResult.provenance,
    ...e26Result.provenance,
    ...e53Result.provenance,
    ...e53RiverResult.provenance,
    ...obsResult.provenance,
  ];
  console.log(`  Provenance records: ${allProv.length}`);

  const graph = [
    ...e22,
    ...e25Result.entities,
    ...organizationResult.entities,
    ...e26Result.entities,
    ...e53Result.entities,
    ...e53RiverResult.entities,
    ...e41All,
    ...e36Entities,
    ...e55Types,
    ...buildInferenceRules(),
    ...e52TimeSpans,
    ...e12Productions,
    ...e36Images,
    ...obsResult.entities,
    ...obsResult.inferences,
    ...allProv,
  ];
  console.log(`\n  Total entities in @graph: ${graph.length}`);

  // Write JSON-LD
  const database = {
    '@context': buildContext(),
    '@id': `${BASE}database`,
    '@type': 'sdo:Dataset',
    'sdo:name': 'Suriname Time Machine - Linked Open Data',
    'sdo:description':
      'Comprehensive linked data graph of Surinamese plantation records and geographical features, connecting CIDOC-CRM entities with full provenance chains.',
    'sdo:dateModified': new Date().toISOString(),
    'sdo:license': 'https://creativecommons.org/licenses/by/4.0/',
    '@graph': graph,
  };

  const jsonldPath = join(LOD_DIR, 'database.jsonld');
  const jsonldStr = JSON.stringify(database, null, 2);
  writeFileSync(jsonldPath, jsonldStr, 'utf-8');
  const jsonldMB = (Buffer.byteLength(jsonldStr) / 1024 / 1024).toFixed(1);
  console.log(`\nWrote ${jsonldPath} (${jsonldMB} MB)`);

  const contextPath = join(LOD_DIR, 'context.jsonld');
  writeFileSync(
    contextPath,
    `${JSON.stringify(buildContextDocument(), null, 2)}\n`,
    'utf-8',
  );
  console.log(`Wrote ${contextPath}`);

  // Build name text indexes for GeoJSON allNames
  // plantationNames: plantation URI -> all E41 name texts
  const plantationNames = new Map<string, string[]>();
  for (const a of plantResult.e41) {
    if (a.identifies_uri && a.symbolic_content) {
      const list = plantationNames.get(a.identifies_uri) ?? [];
      list.push(a.symbolic_content);
      plantationNames.set(a.identifies_uri, list);
    }
  }

  // riverNames: river feature URI -> all E41 name texts
  const riverNames = new Map<string, string[]>();
  for (const a of riverResult.e41) {
    if (a.identifies_uri && a.symbolic_content) {
      const list = riverNames.get(a.identifies_uri) ?? [];
      list.push(a.symbolic_content);
      riverNames.set(a.identifies_uri, list);
    }
  }

  // Write GeoJSON
  const geojson = buildGeoJson(
    plantResult.e53,
    plantationMap,
    riverResult.e53,
    riverMap,
    plantationNames,
    riverNames,
  );
  const geojsonPath = join(LOD_DIR, 'map-features.geojson');
  const geojsonStr = JSON.stringify(geojson, null, 2);
  writeFileSync(geojsonPath, geojsonStr, 'utf-8');
  const geojsonMB = (Buffer.byteLength(geojsonStr) / 1024 / 1024).toFixed(1);
  const featureCount = (geojson.features as unknown[]).length;
  console.log(
    `Wrote ${geojsonPath} (${geojsonMB} MB, ${featureCount} features)`,
  );

  // Validation
  console.log('\n=== Validation ===');

  const noE24 = graph.filter(
    (e) =>
      Array.isArray(e['@type']) &&
      (e['@type'] as string[]).includes('E24_Physical_Human_Made_Thing'),
  ).length;
  console.log(
    `  Legacy E24 entities: ${noE24} ${noE24 === 0 ? '(OK - fully migrated to E25)' : '(PROBLEM - should be 0)'}`,
  );

  const e25WithLoc = e25Result.entities.filter(
    (e) => e.P53_has_location,
  ).length;
  console.log(
    `  E25 with E53 location: ${e25WithLoc}/${e25Result.entities.length}`,
  );

  const e26WithLoc = e26Result.entities.filter(
    (e) => e.P53_has_location,
  ).length;
  console.log(
    `  E26 with E53 location: ${e26WithLoc}/${e26Result.entities.length}`,
  );

  const e41WithContent = e41All.filter(
    (e) => e.P190_has_symbolic_content,
  ).length;
  console.log(`  E41 with P190 content: ${e41WithContent}/${e41All.length}`);

  const obsLinked = obsResult.entities.filter((e) => e.observationOf).length;
  console.log(
    `  Observations with local E74 target: ${obsLinked}/${obsResult.entities.length}`,
  );

  const obsWithE13 = obsResult.entities.filter(
    (e) =>
      Array.isArray(e['@type']) &&
      (e['@type'] as string[]).includes('E13_Attribute_Assignment'),
  ).length;
  console.log(
    `  Observations typed E13: ${obsWithE13}/${obsResult.entities.length}`,
  );

  const obsWithP4 = obsResult.entities.filter((e) => e.P4_has_time_span).length;
  console.log(
    `  Observations with P4 time-span: ${obsWithP4}/${obsResult.entities.length}`,
  );

  const e22WithP128 = e22.filter((e) => e.P128_carries).length;
  console.log(`  E22 with P128 carries: ${e22WithP128}/${e22.length}`);

  const e25WithP138i = e25Result.entities.filter(
    (e) => e.P138i_has_representation,
  ).length;
  console.log(
    `  E25 with P138i representation: ${e25WithP138i}/${e25Result.entities.length}`,
  );

  const e25WithP2 = e25Result.entities.filter((e) => e.P2_has_type).length;
  console.log(
    `  E25 with P2 type (E55): ${e25WithP2}/${e25Result.entities.length}`,
  );

  const e22WithP108i = e22.filter((e) => e.P108i_was_produced_by).length;
  console.log(`  E22 with P108i (produced by): ${e22WithP108i}/${e22.length}`);

  const e12WithP108 = e12Productions.filter((e) => e.P108_has_produced).length;
  console.log(
    `  E12 with P108 (has produced): ${e12WithP108}/${e12Productions.length}`,
  );

  const e12WithMaker = e12Productions.filter((e) => e.sourceMaker).length;
  console.log(
    `  E12 with source maker transcription: ${e12WithMaker}/${e12Productions.length}`,
  );

  const e12WithPlace = e12Productions.filter((e) => e.publicationPlace).length;
  console.log(
    `  E12 with publication-place transcription: ${e12WithPlace}/${e12Productions.length}`,
  );

  const e36WithContent = e36Images.filter((e) => e.contentUrl).length;
  console.log(
    `  E36 with IIIF contentUrl: ${e36WithContent}/${e36Images.length}`,
  );

  const e36WithKeeper = e36Images.filter((e) => e.holdingArchive).length;
  console.log(
    `  E36 with holding-archive transcription: ${e36WithKeeper}/${e36Images.length}`,
  );

  const polygonFeatures = (
    geojson.features as { geometry: { type: string } }[]
  ).filter((f) => f.geometry.type === 'Polygon');
  const lineFeatures = (
    geojson.features as { geometry: { type: string } }[]
  ).filter((f) => f.geometry.type === 'LineString');
  console.log(
    `  GeoJSON: ${polygonFeatures.length} Polygons, ${lineFeatures.length} LineStrings`,
  );

  if (polygonFeatures.length > 0) {
    const feat = polygonFeatures[0] as unknown as {
      geometry: { coordinates: number[][][] };
    };
    const [lon, lat] = feat.geometry.coordinates[0][0];
    const ok = lon > -58 && lon < -53 && lat > 1 && lat < 7;
    console.log(
      `  GeoJSON CRS check (polygon): lon=${lon.toFixed(4)}, lat=${lat.toFixed(4)} -> ${ok ? 'OK' : 'OUTSIDE Suriname'}`,
    );
  }

  if (lineFeatures.length > 0) {
    const feat = lineFeatures[0] as unknown as {
      geometry: { coordinates: number[][] };
    };
    const [lon, lat] = feat.geometry.coordinates[0];
    const ok = lon > -58 && lon < -53 && lat > 1 && lat < 7;
    console.log(
      `  GeoJSON CRS check (line): lon=${lon.toFixed(4)}, lat=${lat.toFixed(4)} -> ${ok ? 'OK' : 'OUTSIDE Suriname'}`,
    );
  }

  console.log('\n=== Done ===');
}

main();
