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
  type E24Row,
  type E41Row,
  type E53Row,
  type MapLink,
  type SourceRow,
  transformPlantations,
} from './transform-plantations';

const LOD_DIR = join(__dirname, '../lod');
const STM = 'https://suriname-timemachine.org/ontology/';
const WD = 'http://www.wikidata.org/entity/';

mkdirSync(LOD_DIR, { recursive: true });

// --- JSON-LD @context ---

function buildContext(): Record<string, unknown> {
  return {
    '@vocab': 'https://schema.org/',
    stm: STM,
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
    Plantation: 'stm:Plantation',
    OrganizationObservation: 'stm:OrganizationObservation',
    ProvenanceRecord: 'stm:ProvenanceRecord',
    E13_Attribute_Assignment: 'crm:E13_Attribute_Assignment',
    E22_Human_Made_Object: 'crm:E22_Human-Made_Object',
    E24_Physical_Human_Made_Thing: 'crm:E24_Physical_Human-Made_Thing',
    E36_Visual_Item: 'crm:E36_Visual_Item',
    E41_Appellation: 'crm:E41_Appellation',
    E52_Time_Span: 'crm:E52_Time-Span',
    E53_Place: 'crm:E53_Place',
    E55_Type: 'crm:E55_Type',
    E74_Group: 'crm:E74_Group',
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
    // STM ontology
    status: { '@id': 'stm:status', '@type': 'xsd:string' },
    psurId: { '@id': 'stm:psurId', '@type': 'xsd:string' },
    fid: { '@id': 'stm:fid', '@type': 'xsd:integer' },
    mapYear: { '@id': 'stm:mapYear', '@type': 'xsd:gYear' },
    observedLabel: { '@id': 'stm:observedLabel', '@type': 'xsd:string' },
    geometrySource: { '@id': 'stm:geometrySource', '@type': '@id' },
    absorbedInto: { '@id': 'stm:absorbedInto', '@type': '@id' },
    mergedInto: { '@id': 'stm:mergedInto', '@type': '@id' },
    observationOf: { '@id': 'stm:observationOf', '@type': '@id' },
    observationYear: { '@id': 'stm:observationYear', '@type': 'xsd:gYear' },
    observedName: { '@id': 'stm:observedName', '@type': 'xsd:string' },
    enslavedCount: { '@id': 'stm:enslavedCount', '@type': 'xsd:integer' },
    product: { '@id': 'stm:product', '@type': 'xsd:string' },
    deserted: { '@id': 'stm:deserted', '@type': 'xsd:boolean' },
    hasOwner: { '@id': 'stm:hasOwner', '@type': 'xsd:string' },
    hasAdministrator: { '@id': 'stm:hasAdministrator', '@type': 'xsd:string' },
    hasDirector: { '@id': 'stm:hasDirector', '@type': 'xsd:string' },
    locationStd: { '@id': 'stm:locationStd', '@type': 'xsd:string' },
    sizeAkkers: { '@id': 'stm:sizeAkkers', '@type': 'xsd:integer' },
    freeResidentsCount: {
      '@id': 'stm:freeResidentsCount',
      '@type': 'xsd:integer',
    },
    pageReference: { '@id': 'stm:pageReference', '@type': 'xsd:string' },
    // Provenance
    wasDerivedFrom: { '@id': 'prov:wasDerivedFrom', '@type': '@id' },
    hadPrimarySource: { '@id': 'prov:hadPrimarySource', '@type': '@id' },
    generatedAtTime: { '@id': 'prov:generatedAtTime', '@type': 'xsd:dateTime' },
    sourceFile: { '@id': 'stm:sourceFile', '@type': 'xsd:string' },
    sourceColumn: { '@id': 'stm:sourceColumn', '@type': 'xsd:string' },
    sourceRow: { '@id': 'stm:sourceRow', '@type': 'xsd:string' },
    transformedBy: { '@id': 'stm:transformedBy', '@type': 'xsd:string' },
    modelEntity: { '@id': 'stm:modelEntity', '@type': 'xsd:string' },
    schemaTable: { '@id': 'stm:schemaTable', '@type': 'xsd:string' },
    linkedVia: { '@id': 'stm:linkedVia', '@type': 'xsd:string' },
    // Map depiction
    labelOnMap: { '@id': 'stm:labelOnMap', '@type': 'xsd:string' },
    mapId: { '@id': 'stm:mapId', '@type': 'xsd:string' },
    hasPolygon: { '@id': 'stm:hasPolygon', '@type': 'xsd:boolean' },
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
      P2_has_type: `${STM}type/source-type/${s.type}`,
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
    return entity;
  });
}

function buildE24Plantations(
  plantations: E24Row[],
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
      '@type': ['E24_Physical_Human_Made_Thing', 'Plantation'],
      status: p.status,
    };

    // CRM alignment: P2 has type -> E55 Type (plantation status)
    if (p.status) {
      entity.P2_has_type = `${STM}type/plantation-status/${p.status.toLowerCase()}`;
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
      // Keep stm:depictedOnMap for frontend compatibility
      entity['stm:depictedOnMap'] = maps.map((m) => ({
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
            return `${STM}visual-item/${m.map_id}-${slug}`;
          }),
        ),
      ];
      entity.P138i_has_representation =
        e36Uris.length === 1 ? e36Uris[0] : e36Uris;
    }

    const provId = `${STM}provenance/e24-${p.slug}`;
    entity.wasDerivedFrom = provId;
    provenance.push({
      '@id': provId,
      '@type': ['ProvenanceRecord'],
      sourceFile:
        'data/07-gis-plantation-map-1930/plantation_polygons_1930.csv',
      sourceColumn: 'plantation_label, qid, coords',
      sourceRow: `fid=${p.fid}`,
      transformedBy: 'scripts/transform-plantations.ts',
      modelEntity: 'E24_Physical_Human-Made_Thing',
      schemaTable: 'e24_human_made_things',
      linkedVia: `qid -> P52_has_current_owner -> wd:${p.p52_owner_qid}`,
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

    const provId = `${STM}provenance/e74-${o.qid}`;
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
      linkedVia: 'P52i_is_current_owner_of -> stm:plantation/{slug}',
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

    const provId = `${STM}provenance/e53-fid-${pl.fid}`;
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
    const id = `${STM}visual-item/${m.map_id}-${slug}`;
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
      '@id': `${STM}type/${t.id}`,
      '@type': ['E55_Type'],
      prefLabel: t.label,
    };
    if (t.broader) {
      entity['skos:broader'] = `${STM}type/${t.broader}`;
    }
    return entity;
  });
}

function buildE52TimeSpans(years: Set<string>): Record<string, unknown>[] {
  return Array.from(years)
    .filter(Boolean)
    .sort()
    .map((year) => ({
      '@id': `${STM}timespan/${year}`,
      '@type': ['E52_Time_Span'],
      prefLabel: year,
      P82a_begin_of_the_begin: `${year}-01-01`,
      P82b_end_of_the_end: `${year}-12-31`,
    }));
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
    // Dual-type: stm:OrganizationObservation + crm:E13_Attribute_Assignment
    const entity: Record<string, unknown> = {
      '@id': o.uri,
      '@type': ['OrganizationObservation', 'E13_Attribute_Assignment'],
    };

    // Original stm: properties (backward compat)
    if (o.organization_uri) {
      entity.observationOf = o.organization_uri;
      // CRM alignment: P140 assigned attribute to
      entity.P140_assigned_attribute_to = o.organization_uri;
    }
    if (o.observation_year) {
      entity.observationYear = o.observation_year;
      observationYears.add(o.observation_year);
      // CRM alignment: P4 has time-span -> E52
      entity.P4_has_time_span = `${STM}timespan/${o.observation_year}`;
    }
    if (o.observed_name) entity.observedName = o.observed_name;
    if (o.owner) entity.hasOwner = o.owner;
    if (o.administrator) entity.hasAdministrator = o.administrator;
    if (o.director) entity.hasDirector = o.director;
    if (o.product) entity.product = o.product;
    if (o.enslaved_count) {
      const n = parseInt(o.enslaved_count);
      if (!isNaN(n)) entity.enslavedCount = n;
    }
    if (o.is_deserted) entity.deserted = true;
    if (o.location_std) entity.locationStd = o.location_std;
    if (o.size_akkers) {
      const n = parseInt(o.size_akkers);
      if (!isNaN(n)) entity.sizeAkkers = n;
    }
    if (o.free_residents) {
      const n = parseInt(o.free_residents);
      if (!isNaN(n)) entity.freeResidentsCount = n;
    }
    if (o.page_reference) entity.pageReference = o.page_reference;
    if (o.source_uri) entity.hadPrimarySource = o.source_uri;
    if (o.split1_id) entity.mergedInto = `${WD}${o.split1_id}`;
    if (o.partof_id) entity['stm:partOfOrganization'] = `${WD}${o.partof_id}`;

    const year = o.observation_year;
    const provId = `${STM}provenance/obs-almanac-${year}`;
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

function buildGeoJson(
  places: E53Row[],
  plantationMap: Map<string, E24Row>,
): Record<string, unknown> {
  const features: Record<string, unknown>[] = [];

  for (const pl of places) {
    if (!pl.coords_wgs84) continue;
    const coords = wktToGeoJsonCoords(pl.coords_wgs84);
    if (!coords) continue;

    const plantation = plantationMap.get(pl.plantation_uri);

    features.push({
      type: 'Feature',
      id: pl.fid,
      geometry: { type: 'Polygon', coordinates: coords },
      properties: {
        fid: parseInt(pl.fid) || null,
        name: plantation?.prefLabel ?? pl.observed_label,
        status: plantation?.status ?? 'unknown',
        mapYear: pl.map_year,
        plantationUri: pl.plantation_uri,
        organizationQid: plantation?.p52_owner_qid ?? '',
        placeUri: pl.uri,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    name: 'Suriname Time Machine - Plantation Locations',
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
  console.log('\n--- Transform: Almanakken ---');
  const almResult = transformAlmanakken();

  // Merge sources
  const allSources = [...plantResult.sources, ...almResult.sources];

  // Build indexes
  const appellationIndex = new Map<string, string[]>();
  for (const a of [...plantResult.e41, ...almResult.appellations]) {
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

  const plantationMap = new Map<string, E24Row>();
  for (const p of plantResult.e24) {
    plantationMap.set(p.uri, p);
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
    const e36Uri = `${STM}visual-item/${m.map_id}-${slug}`;
    const list = e36BySource.get(m.map_uri) ?? [];
    list.push(e36Uri);
    e36BySource.set(m.map_uri, list);
  }

  // Index appellations by source URI (for P128 carries)
  for (const a of [...plantResult.e41, ...almResult.appellations]) {
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

  const e24Result = buildE24Plantations(
    plantResult.e24,
    appellationIndex,
    mapLinkIndex,
  );
  console.log(`  E24 Plantations:    ${e24Result.entities.length}`);

  const e74Result = buildE74Organizations(plantResult.e74);
  console.log(`  E74 Organizations:  ${e74Result.entities.length}`);

  const e53Result = buildE53Places(plantResult.e53);
  console.log(`  E53 Places:         ${e53Result.entities.length}`);

  const e41All = buildE41Appellations([
    ...plantResult.e41,
    ...almResult.appellations,
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

  const allProv = [
    ...e24Result.provenance,
    ...e74Result.provenance,
    ...e53Result.provenance,
    ...obsResult.provenance,
  ];
  console.log(`  Provenance records: ${allProv.length}`);

  const graph = [
    ...e22,
    ...e24Result.entities,
    ...e74Result.entities,
    ...e53Result.entities,
    ...e41All,
    ...e36Entities,
    ...e55Types,
    ...e52TimeSpans,
    ...obsResult.entities,
    ...allProv,
  ];
  console.log(`\n  Total entities in @graph: ${graph.length}`);

  // Write JSON-LD
  const database = {
    '@context': buildContext(),
    '@id': `${STM}database`,
    '@type': 'sdo:Dataset',
    'sdo:name': 'Suriname Time Machine - Linked Open Data',
    'sdo:description':
      'Comprehensive linked data graph of Surinamese plantation records, connecting CIDOC-CRM entities with full provenance chains.',
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
  const geojson = buildGeoJson(plantResult.e53, plantationMap);
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

  const dualTyped = graph.filter(
    (e) =>
      Array.isArray(e['@type']) &&
      (e['@type'] as string[]).includes('E24_Physical_Human_Made_Thing') &&
      (e['@type'] as string[]).includes('E74_Group'),
  ).length;
  console.log(
    `  Dual-typed E24+E74: ${dualTyped} ${dualTyped === 0 ? '(OK)' : '(PROBLEM)'}`,
  );

  const e24WithLoc = e24Result.entities.filter(
    (e) => e.P53_has_location,
  ).length;
  console.log(
    `  E24 with E53 location: ${e24WithLoc}/${e24Result.entities.length}`,
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

  const e24WithP138i = e24Result.entities.filter(
    (e) => e.P138i_has_representation,
  ).length;
  console.log(
    `  E24 with P138i representation: ${e24WithP138i}/${e24Result.entities.length}`,
  );

  const e24WithP2 = e24Result.entities.filter((e) => e.P2_has_type).length;
  console.log(
    `  E24 with P2 type (E55): ${e24WithP2}/${e24Result.entities.length}`,
  );

  const features = geojson.features as {
    geometry: { coordinates: number[][][] };
  }[];
  if (features.length > 0) {
    const [lon, lat] = features[0].geometry.coordinates[0][0];
    const ok = lon > -58 && lon < -53 && lat > 1 && lat < 7;
    console.log(
      `  GeoJSON CRS check: lon=${lon.toFixed(4)}, lat=${lat.toFixed(4)} -> ${ok ? 'OK' : 'OUTSIDE Suriname'}`,
    );
  }

  console.log('\n=== Done ===');
}

main();
