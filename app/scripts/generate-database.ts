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
import { mkdirSync, writeFileSync } from 'fs';
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

const LOD_DIR = join(__dirname, '../lod');
const BASE = 'https://data.suriname-timemachine.org/';
const WD = 'http://www.wikidata.org/entity/';

mkdirSync(LOD_DIR, { recursive: true });

// --- JSON-LD @context ---

function buildContext(): Record<string, unknown> {
  return {
    '@vocab': 'https://schema.org/',
    base: BASE,
    wd: WD,
    wdt: 'http://www.wikidata.org/prop/direct/',
    crm: 'http://www.cidoc-crm.org/cidoc-crm/',
    geo: 'http://www.opengis.net/ont/geosparql#',
    skos: 'http://www.w3.org/2004/02/skos/core#',
    prov: 'http://www.w3.org/ns/prov#',
    sdo: 'https://schema.org/',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
    dcterms: 'http://purl.org/dc/terms/',
    oa: 'http://www.w3.org/ns/oa#',
    picom: 'https://personsincontext.org/model#',
    picot: 'https://personsincontext.org/thesaurus#',
    // CIDOC-CRM type aliases
    Plantation: 'crm:E25_Human-Made_Feature',
    OrganizationObservation: 'crm:E13_Attribute_Assignment',
    ProvenanceRecord: 'prov:Entity',
    E13_Attribute_Assignment: 'crm:E13_Attribute_Assignment',
    E22_Human_Made_Object: 'crm:E22_Human-Made_Object',
    E25_Human_Made_Feature: 'crm:E25_Human-Made_Feature',
    E26_Physical_Feature: 'crm:E26_Physical_Feature',
    E36_Visual_Item: 'crm:E36_Visual_Item',
    E41_Appellation: 'crm:E41_Appellation',
    E52_Time_Span: 'crm:E52_Time-Span',
    E53_Place: 'crm:E53_Place',
    E55_Type: 'crm:E55_Type',
    E74_Group: 'crm:E74_Group',
    // E12 Production
    E12_Production: 'crm:E12_Production',
    // CIDOC-CRM properties
    P1_is_identified_by: { '@id': 'crm:P1_is_identified_by', '@type': '@id' },
    P1i_identifies: { '@id': 'crm:P1i_identifies', '@type': '@id' },
    P2_has_type: { '@id': 'crm:P2_has_type', '@type': '@id' },
    P4_has_time_span: { '@id': 'crm:P4_has_time-span', '@type': '@id' },
    P52_has_current_owner: {
      '@id': 'crm:P52_has_current_owner',
      '@type': '@id',
    },
    P51_has_former_or_current_owner: {
      '@id': 'crm:P51_has_former_or_current_owner',
      '@type': '@id',
    },
    P53_has_location: {
      '@id': 'crm:P53_has_former_or_current_location',
      '@type': '@id',
    },
    P82a_begin_of_the_begin: {
      '@id': 'crm:P82a_begin_of_the_begin',
      '@type': 'xsd:date',
    },
    P82b_end_of_the_end: {
      '@id': 'crm:P82b_end_of_the_end',
      '@type': 'xsd:date',
    },
    P128_carries: { '@id': 'crm:P128_carries', '@type': '@id' },
    P128i_is_carried_by: { '@id': 'crm:P128i_is_carried_by', '@type': '@id' },
    P138_represents: { '@id': 'crm:P138_represents', '@type': '@id' },
    P138i_has_representation: {
      '@id': 'crm:P138i_has_representation',
      '@type': '@id',
    },
    P139_has_alternative_form: {
      '@id': 'crm:P139_has_alternative_form',
      '@type': '@id',
    },
    P140_assigned_attribute_to: {
      '@id': 'crm:P140_assigned_attribute_to',
      '@type': '@id',
    },
    P141_assigned: { '@id': 'crm:P141_assigned', '@type': '@id' },
    // E12 Production properties
    P7_took_place_at: { '@id': 'crm:P7_took_place_at', '@type': 'xsd:string' },
    P14_carried_out_by: {
      '@id': 'crm:P14_carried_out_by',
      '@type': 'xsd:string',
    },
    P108_has_produced: { '@id': 'crm:P108_has_produced', '@type': '@id' },
    P108i_was_produced_by: {
      '@id': 'crm:P108i_was_produced_by',
      '@type': '@id',
    },
    // E36 Visual Item (digital reproduction) properties
    P50_has_current_keeper: {
      '@id': 'crm:P50_has_current_keeper',
      '@type': 'xsd:string',
    },
    contentUrl: { '@id': 'sdo:contentUrl', '@type': '@id' },
    P190_has_symbolic_content: {
      '@id': 'crm:P190_has_symbolic_content',
      '@type': 'xsd:string',
    },
    P70i_is_documented_in: {
      '@id': 'crm:P70i_is_documented_in',
      '@type': '@id',
    },
    P72_has_language: { '@id': 'crm:P72_has_language', '@type': '@id' },
    // GeoSPARQL
    hasGeometry: 'geo:hasGeometry',
    asWKT: { '@id': 'geo:asWKT', '@type': 'geo:wktLiteral' },
    // SKOS
    prefLabel: 'skos:prefLabel',
    altLabel: 'skos:altLabel',
    closeMatch: { '@id': 'skos:closeMatch', '@type': '@id' },
    // Schema.org
    additionalType: { '@id': 'sdo:additionalType', '@type': '@id' },
    sameAs: { '@id': 'sdo:sameAs', '@type': '@id' },
    parentOrganization: { '@id': 'sdo:parentOrganization', '@type': '@id' },
    // Dublin Core
    'dcterms:description': {
      '@id': 'dcterms:description',
      '@type': 'xsd:string',
    },
    // Mapped properties (CRM/PROV/DC equivalents)
    featureType: { '@id': 'crm:P2_has_type', '@type': 'xsd:string' },
    mainBodyWater: { '@id': 'crm:P3_has_note', '@type': 'xsd:string' },
    status: { '@id': 'crm:P2_has_type', '@type': 'xsd:string' },
    psurId: { '@id': 'crm:P1_is_identified_by', '@type': 'xsd:string' },
    fid: { '@id': 'crm:P48_has_preferred_identifier', '@type': 'xsd:integer' },
    mapYear: { '@id': 'crm:P4_has_time-span', '@type': 'xsd:gYear' },
    observedLabel: { '@id': 'crm:P1_is_identified_by', '@type': 'xsd:string' },
    geometrySource: { '@id': 'prov:wasDerivedFrom', '@type': '@id' },
    absorbedInto: { '@id': 'crm:P99i_was_dissolved_by', '@type': '@id' },
    mergedInto: { '@id': 'crm:P124_transformed', '@type': '@id' },
    observationOf: { '@id': 'crm:P140_assigned_attribute_to', '@type': '@id' },
    observationYear: { '@id': 'crm:P4_has_time-span', '@type': 'xsd:gYear' },
    observedName: { '@id': 'crm:P141_assigned', '@type': 'xsd:string' },
    product: { '@id': 'crm:P141_assigned', '@type': 'xsd:string' },
    deserted: { '@id': 'crm:P141_assigned', '@type': 'xsd:boolean' },
    hasOwner: { '@id': 'crm:P14_carried_out_by', '@type': 'xsd:string' },
    hasAdministrator: {
      '@id': 'crm:P14_carried_out_by',
      '@type': 'xsd:string',
    },
    hasDirector: { '@id': 'crm:P14_carried_out_by', '@type': 'xsd:string' },
    locationStd: { '@id': 'crm:P7_took_place_at', '@type': 'xsd:string' },
    sizeAkkers: { '@id': 'crm:P43_has_dimension', '@type': 'xsd:integer' },
    pageReference: { '@id': 'crm:P3_has_note', '@type': 'xsd:string' },
    // Provenance
    wasDerivedFrom: { '@id': 'prov:wasDerivedFrom', '@type': '@id' },
    hadPrimarySource: { '@id': 'prov:hadPrimarySource', '@type': '@id' },
    generatedAtTime: { '@id': 'prov:generatedAtTime', '@type': 'xsd:dateTime' },
    sourceFile: { '@id': 'prov:hadPrimarySource', '@type': 'xsd:string' },
    sourceColumn: { '@id': 'dcterms:description', '@type': 'xsd:string' },
    sourceRow: { '@id': 'dcterms:identifier', '@type': 'xsd:string' },
    transformedBy: { '@id': 'prov:wasGeneratedBy', '@type': 'xsd:string' },
    modelEntity: { '@id': 'dcterms:conformsTo', '@type': 'xsd:string' },
    schemaTable: { '@id': 'dcterms:isPartOf', '@type': 'xsd:string' },
    linkedVia: { '@id': 'rdfs:comment', '@type': 'xsd:string' },
    // Map depiction
    labelOnMap: {
      '@id': 'crm:P190_has_symbolic_content',
      '@type': 'xsd:string',
    },
    mapId: { '@id': 'crm:P48_has_preferred_identifier', '@type': 'xsd:string' },
    hasPolygon: { '@id': 'geo:sfContains', '@type': 'xsd:boolean' },
  };
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
    if (p.p52_owner_qid)
      entity.P52_has_current_owner = `${WD}${p.p52_owner_qid}`;
    if (p.p51_former_owner_qid)
      entity.P51_has_former_or_current_owner = `${WD}${p.p51_former_owner_qid}`;
    if (p.p53_place_uri) entity.P53_has_location = p.p53_place_uri;

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
      linkedVia: `qid -> P52_has_current_owner -> wd:${p.p52_owner_qid}`,
    });

    entities.push(entity);
  }

  return { entities, provenance };
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

function buildE74Organizations(
  orgs: {
    qid: string;
    uri: string;
    prefLabel: string;
    psur_id: string;
    psur_id2: string;
    psur_id3: string;
    absorbed_into_qid: string;
  }[],
): {
  entities: Record<string, unknown>[];
  provenance: Record<string, unknown>[];
} {
  const entities: Record<string, unknown>[] = [];
  const provenance: Record<string, unknown>[] = [];

  for (const o of orgs) {
    const entity: Record<string, unknown> = {
      '@id': o.uri,
      '@type': ['E74_Group', 'sdo:Organization'],
      additionalType: `${WD}Q188913`,
    };

    if (o.prefLabel) entity.prefLabel = o.prefLabel;

    const psurIds = [o.psur_id, o.psur_id2, o.psur_id3].filter(Boolean);
    if (psurIds.length > 0)
      entity.psurId = psurIds.length === 1 ? psurIds[0] : psurIds;
    if (o.absorbed_into_qid)
      entity.absorbedInto = `${WD}${o.absorbed_into_qid}`;
    entity.sameAs = o.uri;

    const provId = `${BASE}provenance/e74-${o.qid}`;
    entity.wasDerivedFrom = provId;
    provenance.push({
      '@id': provId,
      '@type': ['ProvenanceRecord'],
      sourceFile:
        'data/07-gis-plantation-map-1930/plantation_polygons_1930.csv',
      sourceColumn: 'qid, psur_id, qid_alt',
      sourceRow: `qid=${o.qid}`,
      transformedBy: 'scripts/transform-plantations.ts',
      modelEntity: 'E74_Group',
      schemaTable: 'e74_groups',
      linkedVia: 'P52i_is_current_owner_of -> plantation/{slug}',
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
  const types: { id: string; label: string; broader?: string }[] = [
    // Plantation status vocabulary
    {
      id: 'plantation-status/built',
      label: 'Built',
      broader: 'plantation-status',
    },
    {
      id: 'plantation-status/planned',
      label: 'Planned',
      broader: 'plantation-status',
    },
    {
      id: 'plantation-status/abandoned',
      label: 'Abandoned',
      broader: 'plantation-status',
    },
    {
      id: 'plantation-status/unknown',
      label: 'Unknown',
      broader: 'plantation-status',
    },
    // Source type vocabulary
    { id: 'source-type/map', label: 'Map' },
    { id: 'source-type/almanac', label: 'Almanac' },
    { id: 'source-type/register', label: 'Register' },
    // Product types
    { id: 'product/sugar', label: 'Sugar' },
    { id: 'product/coffee', label: 'Coffee' },
    { id: 'product/cacao', label: 'Cacao' },
    { id: 'product/cotton', label: 'Cotton' },
    { id: 'product/wood', label: 'Wood' },
  ];

  return types.map((t) => {
    const entity: Record<string, unknown> = {
      '@id': `${BASE}type/${t.id}`,
      '@type': ['E55_Type'],
      prefLabel: t.label,
    };
    if (t.broader) {
      entity['skos:broader'] = `${BASE}type/${t.broader}`;
    }
    return entity;
  });
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
    if (s.maker) entity.P14_carried_out_by = s.maker;
    if (s.publication_place) entity.P7_took_place_at = s.publication_place;
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
    if (s.holding_archive) entity.P50_has_current_keeper = s.holding_archive;
    if (s.handle_url) entity['dcterms:identifier'] = s.handle_url;
    entities.push(entity);
  }
  return entities;
}

function buildObservations(obs: ObservationRow[]): {
  entities: Record<string, unknown>[];
  provenance: Record<string, unknown>[];
  observationYears: Set<string>;
} {
  const entities: Record<string, unknown>[] = [];
  const provenance: Record<string, unknown>[] = [];
  const seenYears = new Set<string>();
  const observationYears = new Set<string>();

  for (const o of obs) {
    // Type: E13_Attribute_Assignment
    const entity: Record<string, unknown> = {
      '@id': o.uri,
      '@type': ['E13_Attribute_Assignment'],
    };

    // CRM properties
    if (o.organization_uri) {
      entity.observationOf = o.organization_uri;
      // CRM alignment: P140 assigned attribute to
      entity.P140_assigned_attribute_to = o.organization_uri;
    }
    if (o.observation_year) {
      entity.observationYear = o.observation_year;
      observationYears.add(o.observation_year);
      // CRM alignment: P4 has time-span -> E52
      entity.P4_has_time_span = `${BASE}timespan/${o.observation_year}`;
    }
    if (o.observed_name) entity.observedName = o.observed_name;
    if (o.owner) entity.hasOwner = o.owner;
    if (o.administrator) entity.hasAdministrator = o.administrator;
    if (o.director) entity.hasDirector = o.director;
    if (o.product) entity.product = o.product;
    if (o.is_deserted) entity.deserted = true;
    if (o.location_std) entity.locationStd = o.location_std;
    if (o.size_akkers) {
      const n = parseInt(o.size_akkers);
      if (!isNaN(n)) entity.sizeAkkers = n;
    }
    if (o.page_reference) entity.pageReference = o.page_reference;
    if (o.source_uri) entity.hadPrimarySource = o.source_uri;
    if (o.split1_id) entity.mergedInto = `${WD}${o.split1_id}`;
    if (o.partof_id) entity['parentOrganization'] = `${WD}${o.partof_id}`;

    const year = o.observation_year;
    const provId = `${BASE}provenance/obs-almanac-${year}`;
    entity.wasDerivedFrom = provId;

    if (year && !seenYears.has(year)) {
      seenYears.add(year);
      provenance.push({
        '@id': provId,
        '@type': ['ProvenanceRecord'],
        sourceFile:
          'data/06-almanakken - Plantations Surinaamse Almanakken/Plantations Surinaamse Almanakken v1.0.csv',
        sourceColumn:
          'recordid, plantation_id, year, eigenaren, slaven, product_std',
        sourceRow: `year=${year}`,
        transformedBy: 'scripts/transform-almanakken.ts',
        modelEntity: 'E13_Attribute_Assignment / OrganizationObservation',
        schemaTable: 'observations',
        linkedVia: 'plantation_id -> P140/observationOf -> wd:{Q-ID}',
      });
    }

    entities.push(entity);
  }

  return { entities, provenance, observationYears };
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
): Record<string, unknown> {
  const features: Record<string, unknown>[] = [];

  // Plantation polygons
  for (const pl of places) {
    if (!pl.coords_wgs84) continue;
    const coords = wktToGeoJsonCoords(pl.coords_wgs84);
    if (!coords) continue;

    const plantation = plantationMap.get(pl.plantation_uri);

    features.push({
      type: 'Feature',
      id: `plantation-${pl.fid}`,
      geometry: { type: 'Polygon', coordinates: coords },
      properties: {
        fid: parseInt(pl.fid) || null,
        name: plantation?.prefLabel ?? pl.observed_label,
        status: plantation?.status ?? 'unknown',
        featureType: 'plantation',
        mapYear: pl.map_year,
        plantationUri: pl.plantation_uri,
        organizationQid: plantation?.p52_owner_qid ?? '',
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

    features.push({
      type: 'Feature',
      id: `river-${rp.fid}`,
      geometry: { type: 'LineString', coordinates: coords },
      properties: {
        fid: parseInt(rp.fid) || null,
        name: river?.prefLabel ?? rp.observed_label,
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
  const appellationIndex = new Map<string, string[]>();
  for (const a of [
    ...plantResult.e41,
    ...almResult.appellations,
    ...riverResult.e41,
  ]) {
    const key = a.identifies_uri;
    if (key) {
      const list = appellationIndex.get(key) ?? [];
      list.push(a.uri);
      appellationIndex.set(key, list);
    }
  }

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
  );
  console.log(`  E25 Plantations:    ${e25Result.entities.length}`);

  const e26Result = buildE26PhysicalFeatures(riverResult.e26, appellationIndex);
  console.log(`  E26 Rivers/Creeks:  ${e26Result.entities.length}`);

  const e74Result = buildE74Organizations(plantResult.e74);
  console.log(`  E74 Organizations:  ${e74Result.entities.length}`);

  const e53Result = buildE53Places(plantResult.e53);
  const e53RiverResult = buildE53RiverPlaces(riverResult.e53);
  console.log(
    `  E53 Places:         ${e53Result.entities.length + e53RiverResult.entities.length} (${e53Result.entities.length} plantation, ${e53RiverResult.entities.length} river)`,
  );

  const e41All = buildE41Appellations([
    ...plantResult.e41,
    ...almResult.appellations,
    ...riverResult.e41,
  ]);
  console.log(`  E41 Appellations:   ${e41All.length}`);

  const obsResult = buildObservations(almResult.observations);
  console.log(
    `  Observations:       ${obsResult.entities.length} (dual-typed E13)`,
  );

  // Structural entities
  console.log(`  E36 Visual Items:   ${e36Entities.length}`);

  const e55Types = buildE55Types();
  console.log(`  E55 Types:          ${e55Types.length}`);

  const e52TimeSpans = buildE52TimeSpans(obsResult.observationYears);
  console.log(`  E52 Time-Spans:     ${e52TimeSpans.length}`);

  // E12 Production events: who made each source, where, when
  const e12Productions = buildE12Productions(allSources);
  console.log(`  E12 Productions:    ${e12Productions.length}`);

  // E36 Visual Item entities: IIIF digital reproductions
  const e36Images = buildE36Images(allSources);
  console.log(`  E36 Images:         ${e36Images.length}`);

  const allProv = [
    ...e25Result.provenance,
    ...e26Result.provenance,
    ...e74Result.provenance,
    ...e53Result.provenance,
    ...e53RiverResult.provenance,
    ...obsResult.provenance,
  ];
  console.log(`  Provenance records: ${allProv.length}`);

  const graph = [
    ...e22,
    ...e25Result.entities,
    ...e26Result.entities,
    ...e74Result.entities,
    ...e53Result.entities,
    ...e53RiverResult.entities,
    ...e41All,
    ...e36Entities,
    ...e55Types,
    ...e52TimeSpans,
    ...e12Productions,
    ...e36Images,
    ...obsResult.entities,
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

  // Write GeoJSON
  const geojson = buildGeoJson(
    plantResult.e53,
    plantationMap,
    riverResult.e53,
    riverMap,
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
    `  Observations with org link: ${obsLinked}/${obsResult.entities.length}`,
  );

  const obsWithE13 = obsResult.entities.filter(
    (e) =>
      Array.isArray(e['@type']) &&
      (e['@type'] as string[]).includes('E13_Attribute_Assignment'),
  ).length;
  console.log(
    `  Observations dual-typed E13: ${obsWithE13}/${obsResult.entities.length}`,
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

  const e12WithP14 = e12Productions.filter((e) => e.P14_carried_out_by).length;
  console.log(
    `  E12 with P14 (carried out by): ${e12WithP14}/${e12Productions.length}`,
  );

  const e12WithP7 = e12Productions.filter((e) => e.P7_took_place_at).length;
  console.log(
    `  E12 with P7 (took place at): ${e12WithP7}/${e12Productions.length}`,
  );

  const e36WithContent = e36Images.filter((e) => e.contentUrl).length;
  console.log(
    `  E36 with IIIF contentUrl: ${e36WithContent}/${e36Images.length}`,
  );

  const e36WithP50 = e36Images.filter((e) => e.P50_has_current_keeper).length;
  console.log(
    `  E36 with P50 (current keeper): ${e36WithP50}/${e36Images.length}`,
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
