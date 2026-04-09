'use client';

import { useEffect, useMemo, useState } from 'react';

/* ─── Helpers ──────────────────────────────────────────────────── */

/** Colors that need dark text for contrast */
const LIGHT_BG = new Set([
  '#fef3ba',
  '#ffe6eb',
  '#ffbdca',
  '#d4edda',
  '#cce5ff',
  '#e2d9f3',
  '#d4c4fb',
  '#82ddff',
  '#b8c9e0',
  '#f0a0a0',
  '#e0b0b0',
]);

function badgeTextColor(bg: string): string {
  return LIGHT_BG.has(bg) ? '#78716c' : '#fff';
}

/* ─── Schema definition ────────────────────────────────────────── */
interface EntityDef {
  id: string;
  type: string;
  label: string;
  crmClass: string;
  desc: string;
  color: string;
  cx: number;
  cy: number;
  dataKey: string;
  structural?: boolean;
  properties: { name: string; range: string }[];
}

interface RelDef {
  from: string;
  to: string;
  label: string;
  desc: string;
}

const ENTITIES: EntityDef[] = [
  /* ── Data-backed entities ────────────────────────────────────── */
  {
    id: 'e25',
    type: 'E25',
    label: 'Plantation',
    crmClass: 'E25 Human-Made Feature',
    desc: 'The central entity -- the physical plantation as a human-made landscape feature. A subclass of both E24 Physical Human-Made Thing and E26 Physical Feature. Connected to locations via P53 and to operating organizations via P52. Classified via SKOS thesaurus concepts.',
    color: '#e6956b',
    cx: 380,
    cy: 330,
    dataKey: 'plantations',
    properties: [
      { name: 'P1 is identified by', range: 'E41 Appellation' },
      { name: 'rdfs:label', range: 'string (@nl)' },
      { name: 'P2 has type', range: 'E55 Type (via SKOS thesaurus)' },
      { name: 'P53 has location', range: 'E53 Place (polygon geometry)' },
      { name: 'P52 has current owner', range: 'E74 Organization (via Q-ID)' },
      { name: 'P51 has former or current owner', range: 'E74 Organization' },
      {
        name: 'P124i was transformed by',
        range: 'E81 Transformation (merger)',
      },
      {
        name: 'P138i has representation',
        range: 'E36 Visual Item (via source)',
      },
    ],
  },
  {
    id: 'e26',
    type: 'E26',
    label: 'Physical Feature',
    crmClass: 'E26 Physical Feature',
    desc: 'Natural geographical features such as rivers and creeks. E26 is the superclass of E25 (human-made features). Connected to locations via P53. Classified via SKOS thesaurus concepts (river, creek). No ownership relationship (rivers have no owners).',
    color: '#5b9bd5',
    cx: 150,
    cy: 330,
    dataKey: 'physical-features',
    properties: [
      { name: 'P1 is identified by', range: 'E41 Appellation' },
      { name: 'rdfs:label', range: 'string (@nl)' },
      { name: 'P2 has type', range: 'E55 Type (river / creek via thesaurus)' },
      { name: 'P53 has location', range: 'E53 Place (LineString geometry)' },
    ],
  },
  {
    id: 'e74',
    type: 'E74',
    label: 'Organization',
    crmClass: 'E74 Group / sdo:Organization',
    desc: 'The legal entity that owns or operates the plantation. Identified by Wikidata Q-IDs. Separated from E25 to model the distinction between the physical place and its legal operator. Annual observations (E13) record time-varying properties.',
    color: '#ffbdca',
    cx: 720,
    cy: 290,
    dataKey: 'organizations',
    properties: [
      { name: 'P1 is identified by', range: 'E41 Appellation' },
      { name: 'rdfs:label', range: 'string (@nl)' },
      { name: 'sdo:additionalType', range: 'wd:Q188913' },
      {
        name: 'P48 has preferred identifier',
        range: 'E42 Identifier (Wikidata Q-ID)',
      },
      {
        name: 'P1 is identified by',
        range: 'E42 Identifier (PSUR register ID)',
      },
      {
        name: 'P99i was dissolved by',
        range: 'E68 Dissolution (-> successor E74)',
      },
    ],
  },
  {
    id: 'e53',
    type: 'E53',
    label: 'Place',
    crmClass: 'E53 Place',
    desc: 'Spatial location of the plantation. Polygons digitized from the 1930 Bos & Weyerman map in QGIS. Source CRS is EPSG:31170 (Suriname Old TM), reprojected to WGS84 (EPSG:4326) using datum shift +towgs84=-265,120,-358,0,0,0,0. Geometry stored as GeoSPARQL wktLiteral.',
    color: '#94cc7d',
    cx: 150,
    cy: 530,
    dataKey: 'places',
    properties: [
      {
        name: 'P48 has preferred identifier',
        range: 'E42 Identifier (QGIS feature ID)',
      },
      { name: 'P1 is identified by', range: 'E41 Appellation (map label)' },
      { name: 'dcterms:conformsTo', range: 'EPSG:31170 (Suriname Old TM)' },
      { name: 'geo:hasCentroid', range: 'POINT (WGS84 lon/lat)' },
      { name: 'geo:hasGeometry', range: 'geo:Geometry' },
      { name: 'geo:asWKT', range: 'wktLiteral (POLYGON)' },
      { name: 'P70i is documented in', range: 'E22 Source (map)' },
    ],
  },
  {
    id: 'e41',
    type: 'E41',
    label: 'Appellation',
    crmClass: 'E41 Appellation',
    desc: 'Names as first-class entities. Each source creates its own E41 instance. Map labels identify E25; almanac names identify E74. Temporal scope is inferred from the E22 source production date. Linked via P139 has alternative form.',
    color: '#fef3ba',
    cx: 620,
    cy: 100,
    dataKey: 'appellations-count',
    properties: [
      { name: 'P190 has symbolic content', range: 'string' },
      { name: 'P139 has alternative form', range: 'E41 Appellation' },
      { name: 'P1i identifies', range: 'E25 Plantation or E74 Organization' },
      { name: 'P128i is carried by', range: 'E22 Source' },
      { name: 'P72 has language', range: 'E56 Language' },
    ],
  },
  {
    id: 'e22',
    type: 'E22',
    label: 'Source',
    crmClass: 'E22 Human-Made Object',
    desc: 'Physical sources: maps, almanacs, registers. The source carries visual items (E36) and appellations (E41) that represent or identify entities. Each source has an E12 Production event recording who made it, where, and when. Digital reproductions (IIIF scans) are also modeled as E36 Visual Item, linked via P138 represents. The Almanakken (Surinaamse Almanakken) is modeled as a single E22 for the entire series.',
    color: '#c78e66',
    cx: 200,
    cy: 100,
    dataKey: 'sources',
    properties: [
      { name: 'P128 carries', range: 'E36 Visual Item' },
      { name: 'P128 carries', range: 'E41 Appellation' },
      { name: 'P2 has type', range: 'E55 Type (map / almanac / register)' },
      { name: 'P108i was produced by', range: 'E12 Production' },
      {
        name: 'P48 has preferred identifier',
        range: 'E42 Identifier (map ID)',
      },
      { name: 'rdfs:label', range: 'string' },
    ],
  },
  {
    id: 'e13',
    type: 'E13',
    label: 'Attr. Assignment',
    crmClass: 'E13 Attribute Assignment',
    desc: 'Each almanac row is an E13 Attribute Assignment -- not a source. The Almanakken is one E22 (the entire bound book/series); each CSV row is a separate E13 recording one year of observation about one organization. Properties: name, owner, administrator, director, product, size, location. Person-related data (enslaved counts) deferred to PICO integration. Plantation classification (verlaten) handled via E17 Type Assignment. Coverage spans ~1750-1863.',
    color: '#82ddff',
    cx: 580,
    cy: 510,
    dataKey: 'observations-count',
    properties: [
      { name: 'P140 assigned attribute to', range: 'E74 Organization' },
      { name: 'P4 has time-span', range: 'E52 Time-Span (year)' },
      { name: 'P141 assigned (name)', range: 'E41 Appellation' },
      { name: 'P141 assigned (product)', range: 'E55 Type' },
      { name: 'P14 carried out by (eigenaar)', range: 'E39 Actor' },
      { name: 'P14 carried out by (administrateur)', range: 'E39 Actor' },
      { name: 'P14 carried out by (directeur)', range: 'E39 Actor' },
      { name: 'P43 has dimension (size)', range: 'E54 Dimension (akkers)' },
      { name: 'P7 took place at', range: 'E53 Place (text, not geo)' },
      { name: 'P3 has note', range: 'string (almanac page ref)' },
      { name: 'prov:hadPrimarySource', range: 'E22 Source' },
    ],
  },
  /* ── Structural entities (not directly data-backed) ─────────── */
  {
    id: 'e17',
    type: 'E17',
    label: 'Type Assignment',
    crmClass: 'E17 Type Assignment',
    desc: 'Classifies a plantation as abandoned (verlaten) when an almanac row marks it as deserted. A subclass of E13 Attribute Assignment with specific properties P41 classified (targeting E25 Plantation) and P42 assigned (targeting E55 Type). Inherits P4 has time-span and prov:hadPrimarySource from E13.',
    color: '#f0a0a0',
    cx: 400,
    cy: 490,
    dataKey: '',
    structural: true,
    properties: [
      { name: 'P41 classified', range: 'E25 Plantation' },
      { name: 'P42 assigned', range: 'E55 Type (plantation-status/abandoned)' },
      { name: 'P4 has time-span', range: 'E52 Time-Span (year)' },
      { name: 'prov:hadPrimarySource', range: 'E22 Source (almanac)' },
    ],
  },
  {
    id: 'e36',
    type: 'E36',
    label: 'Visual Item',
    crmClass: 'E36 Visual Item',
    desc: 'The visual content carried by a source. A map (E22) carries a visual item (E36) that represents the physical plantation (E25). This intermediary class enables the principle: "maps depict things; things have locations." Digital reproductions (IIIF scans) are also E36 Visual Items that represent the physical source (E22) via P138.',
    color: '#d4a574',
    cx: 380,
    cy: 160,
    dataKey: '',
    structural: true,
    properties: [
      { name: 'P138 represents', range: 'E25 Human-Made Feature' },
      { name: 'P138 represents', range: 'E22 Human-Made Object (digital scan)' },
      { name: 'P128i is carried by', range: 'E22 Human-Made Object' },
      { name: 'P50 has current keeper', range: 'string (archive name)' },
      { name: 'sdo:contentUrl', range: 'IIIF info.json URL' },
    ],
  },
  {
    id: 'e52',
    type: 'E52',
    label: 'Time-Span',
    crmClass: 'E52 Time-Span',
    desc: 'Temporal extent of an E13 observation or E12 production event. Almanac years span ~1750-1863. E12 Production events for sources carry the date of creation, making colonial provenance explicit.',
    color: '#cce5ff',
    cx: 810,
    cy: 450,
    dataKey: '',
    structural: true,
    properties: [
      { name: 'P82 at some time within', range: 'xsd:gYear' },
      { name: 'P81 ongoing throughout', range: 'xsd:gYear' },
      { name: 'rdfs:label', range: 'string (e.g. "1820")' },
    ],
  },
  {
    id: 'e39',
    type: 'E39',
    label: 'Actor',
    crmClass: 'E39 Actor',
    desc: 'People from almanac columns: eigenaren (owners), administrateurs, and directeurs. Currently stored as name strings. Entity resolution is needed to link identical persons across years and plantations. PICO-compatible modeling.',
    color: '#ffe6eb',
    cx: 870,
    cy: 580,
    dataKey: '',
    structural: true,
    properties: [
      { name: 'P1 is identified by', range: 'E41 Appellation' },
      { name: 'pico:hasRole', range: 'picot:owner / admin / director' },
      { name: 'rdfs:label', range: 'string' },
    ],
  },
  {
    id: 'e55',
    type: 'E55',
    label: 'Type',
    crmClass: 'E55 Type',
    desc: 'Controlled vocabulary terms: products (sugar, coffee, cocoa, cotton), plantation status (abandoned/verlaten via E17 Type Assignment), source types (map/almanac/register), certainty levels for qualified links. Managed as an authority list (thesaurus/taxonomy TBD).',
    color: '#d4edda',
    cx: 500,
    cy: 660,
    dataKey: '',
    structural: true,
    properties: [
      { name: 'rdfs:label', range: 'string' },
      { name: 'P127 has broader term', range: 'E55 Type (hierarchy)' },
      { name: 'P2i is type of', range: 'E25 / E74 / E22 (typed entity)' },
    ],
  },
  {
    id: 'e54',
    type: 'E54',
    label: 'Dimension',
    crmClass: 'E54 Dimension',
    desc: 'Physical measurements. Size in akkers (Surinamese land unit) as recorded in the almanac. The akker is approximately 0.43 hectares.',
    color: '#e2d9f3',
    cx: 280,
    cy: 660,
    dataKey: '',
    structural: true,
    properties: [
      { name: 'P90 has value', range: 'xsd:decimal' },
      { name: 'P91 has unit', range: 'E58 Measurement Unit ("akkers")' },
      { name: 'rdfs:label', range: 'string' },
    ],
  },
  {
    id: 'e12',
    type: 'E12',
    label: 'Production',
    crmClass: 'E12 Production',
    desc: 'The production event of a physical source (E22). Records who made the source (P14), where it was produced (P7), and when (P4). For maps, makers are Dutch colonial cartographers and publishers like Departement van Kolonien in Den Haag. For almanacs, the Koloniaal Bestuur van Suriname in Paramaribo. This makes colonial provenance explicit in the data graph.',
    color: '#f0c87a',
    cx: 60,
    cy: 30,
    dataKey: '',
    structural: true,
    properties: [
      { name: 'P108 has produced', range: 'E22 Human-Made Object' },
      { name: 'P14 carried out by', range: 'string (maker name)' },
      { name: 'P7 took place at', range: 'string (publication place)' },
      { name: 'P4 has time-span', range: 'E52 Time-Span' },
    ],
  },
  {
    id: 'e42',
    type: 'E42',
    label: 'Identifier',
    crmClass: 'E42 Identifier',
    desc: 'External identifiers linking entities to authority databases. Wikidata Q-IDs for organizations (e.g. Q4392658), PSUR IDs from slave registers, QGIS feature IDs (fid) for polygon geometries, and map catalogue identifiers.',
    color: '#b8c9e0',
    cx: 920,
    cy: 100,
    dataKey: '',
    structural: true,
    properties: [
      { name: 'P190 has symbolic content', range: 'string (the ID value)' },
      { name: 'P2 has type', range: 'E55 Type (QID / PSUR / fid / mapId)' },
      { name: 'rdfs:label', range: 'string' },
    ],
  },
  {
    id: 'e81',
    type: 'E81',
    label: 'Transformation',
    crmClass: 'E81 Transformation',
    desc: "Models plantation mergers. When plantations merge, E81 simultaneously ends old E25 entities and produces the merged E25. For example, Suzanna'sdal and Geijersvlijt merging into one plantation by 1930.",
    color: '#f0a0a0',
    cx: 180,
    cy: 380,
    dataKey: '',
    structural: true,
    properties: [
      {
        name: 'P124 transformed',
        range: 'E25 Human-Made Feature (old)',
      },
      {
        name: 'P123 resulted in',
        range: 'E25 Human-Made Feature (merged)',
      },
      { name: 'P4 has time-span', range: 'E52 Time-Span' },
    ],
  },
  {
    id: 'e68',
    type: 'E68',
    label: 'Dissolution',
    crmClass: 'E68 Dissolution',
    desc: 'Models when an organization (E74) is absorbed by another. The dissolved organization ceases to exist; the absorbing organization acts as agent of the dissolution via P14 carried out by.',
    color: '#e0b0b0',
    cx: 920,
    cy: 220,
    dataKey: '',
    structural: true,
    properties: [
      { name: 'P99 dissolved', range: 'E74 Group (dissolved org)' },
      { name: 'P14 carried out by', range: 'E74 Group (absorbing org)' },
      { name: 'P4 has time-span', range: 'E52 Time-Span' },
    ],
  },
];

const RELATIONS: RelDef[] = [
  {
    from: 'e25',
    to: 'e74',
    label: 'P52 has current owner',
    desc: 'The plantation is owned by this organization',
  },
  {
    from: 'e25',
    to: 'e53',
    label: 'P53 has location',
    desc: 'The plantation is located at this place (polygon geometry from 1930 map)',
  },
  {
    from: 'e25',
    to: 'e41',
    label: 'P1 is identified by',
    desc: 'The plantation is identified by this name (from map label)',
  },
  {
    from: 'e26',
    to: 'e53',
    label: 'P53 has location',
    desc: 'The natural feature is located at this place (LineString geometry from 1930 map)',
  },
  {
    from: 'e26',
    to: 'e41',
    label: 'P1 is identified by',
    desc: 'The natural feature is identified by this name (from map label)',
  },
  {
    from: 'e26',
    to: 'e55',
    label: 'P2 has type',
    desc: 'Feature type classification: river or creek (via SKOS thesaurus)',
  },
  {
    from: 'e74',
    to: 'e41',
    label: 'P1 is identified by',
    desc: 'The organization is identified by this name (from almanac)',
  },
  {
    from: 'e22',
    to: 'e41',
    label: 'P128 carries',
    desc: 'The source carries this appellation (name text)',
  },
  {
    from: 'e22',
    to: 'e36',
    label: 'P128 carries',
    desc: 'The source (map) carries a visual item that represents the plantation',
  },
  {
    from: 'e36',
    to: 'e25',
    label: 'P138 represents',
    desc: 'The visual item represents the physical plantation -- the key link in the universal source pattern',
  },
  {
    from: 'e36',
    to: 'e22',
    label: 'P138 represents',
    desc: 'The digital scan (IIIF image) represents the physical source object',
  },
  {
    from: 'e13',
    to: 'e74',
    label: 'P140 assigned attr. to',
    desc: 'This attribute assignment records data about the organization',
  },
  {
    from: 'e13',
    to: 'e22',
    label: 'prov:hadPrimarySource',
    desc: 'The attribute assignment derives from this source (almanac)',
  },
  {
    from: 'e13',
    to: 'e52',
    label: 'P4 has time-span',
    desc: 'The observation has a temporal extent (the almanac year)',
  },
  {
    from: 'e13',
    to: 'e39',
    label: 'P14 carried out by',
    desc: 'People involved: eigenaar, administrateur, directeur',
  },
  {
    from: 'e74',
    to: 'e55',
    label: 'P2 has type',
    desc: 'Organization type: plantation type (via sdo:additionalType / wd:Q188913)',
  },
  {
    from: 'e13',
    to: 'e54',
    label: 'P43 has dimension',
    desc: 'Physical measurements: size in akkers (Surinamese land unit)',
  },
  {
    from: 'e13',
    to: 'e53',
    label: 'P7 took place at',
    desc: 'Location text from almanac (e.g. "Boven-Commewijne") -- not yet linked to geometry',
  },
  {
    from: 'e12',
    to: 'e22',
    label: 'P108 has produced',
    desc: 'This production event created the source (map, almanac)',
  },
  {
    from: 'e12',
    to: 'e52',
    label: 'P4 has time-span',
    desc: 'When the source was produced (publication year)',
  },
  {
    from: 'e12',
    to: 'e39',
    label: 'P14 carried out by',
    desc: 'Who made the source: Dutch colonial cartographers (maps) or Koloniaal Bestuur (almanacs)',
  },
  {
    from: 'e12',
    to: 'e53',
    label: 'P7 took place at',
    desc: 'Where the source was produced: Den Haag (maps) or Paramaribo (almanacs)',
  },
  {
    from: 'e25',
    to: 'e55',
    label: 'P2 has type',
    desc: 'Plantation status classification: Built, Planned, Abandoned, Unknown',
  },
  {
    from: 'e22',
    to: 'e55',
    label: 'P2 has type',
    desc: 'Source type classification: map, almanac, register',
  },
  {
    from: 'e74',
    to: 'e42',
    label: 'P48 has pref. identifier',
    desc: 'Wikidata Q-ID as the preferred external identifier for the organization',
  },
  {
    from: 'e53',
    to: 'e42',
    label: 'P48 has pref. identifier',
    desc: 'QGIS feature ID (fid) as the preferred identifier for the polygon geometry',
  },
  {
    from: 'e22',
    to: 'e42',
    label: 'P48 has pref. identifier',
    desc: 'Map catalogue identifier or almanac record ID',
  },
  {
    from: 'e81',
    to: 'e25',
    label: 'P124/P123',
    desc: 'E81 Transformation: old plantations (P124 transformed) merge into a new plantation (P123 resulted in)',
  },
  {
    from: 'e68',
    to: 'e74',
    label: 'P99/P14',
    desc: 'E68 Dissolution: dissolves old organization (P99); absorbing organization carried it out (P14)',
  },
  {
    from: 'e13',
    to: 'e41',
    label: 'P141 assigned',
    desc: 'The observed plantation name for this year (E41 Appellation)',
  },
  {
    from: 'e17',
    to: 'e25',
    label: 'P41 classified',
    desc: 'E17 Type Assignment classifies the physical plantation (E25) as abandoned when marked verlaten',
  },
  {
    from: 'e17',
    to: 'e55',
    label: 'P42 assigned',
    desc: 'The type assigned to the plantation: plantation-status/abandoned (verlaten)',
  },
  {
    from: 'e17',
    to: 'e52',
    label: 'P4 has time-span',
    desc: 'When the classification was observed (almanac year)',
  },
  {
    from: 'e17',
    to: 'e22',
    label: 'prov:hadPrimarySource',
    desc: 'The source (almanac) that records the deserted status',
  },
];

/* ─── Data fetching ────────────────────────────────────────────── */
interface EntityCounts {
  plantations: number;
  'physical-features': number;
  organizations: number;
  places: number;
  sources: number;
  'appellations-count': number;
  'observations-count': number;
}

async function fetchCounts(): Promise<EntityCounts> {
  const DATA_BASE = '/data';

  const [
    plantations,
    physicalFeatures,
    organizations,
    places,
    sources,
    appellations,
    observations,
  ] = await Promise.all([
    fetch(`${DATA_BASE}/plantations.json`).then((r) => r.json()),
    fetch(`${DATA_BASE}/physical-features.json`)
      .then((r) => r.json())
      .catch(() => ({})),
    fetch(`${DATA_BASE}/organizations.json`).then((r) => r.json()),
    fetch(`${DATA_BASE}/places.json`).then((r) => r.json()),
    fetch(`${DATA_BASE}/sources.json`).then((r) => r.json()),
    fetch(`${DATA_BASE}/appellations-by-entity.json`).then((r) => r.json()),
    fetch(`${DATA_BASE}/observations-by-org.json`).then((r) => r.json()),
  ]);

  return {
    plantations: Object.keys(plantations).length,
    'physical-features': Object.keys(physicalFeatures).length,
    organizations: Object.keys(organizations).length,
    places: Object.keys(places).length,
    sources: Object.keys(sources).length,
    'appellations-count': Object.values(
      appellations as Record<string, unknown[]>,
    ).reduce((sum, arr) => sum + arr.length, 0),
    'observations-count': Object.values(
      observations as Record<string, unknown[]>,
    ).reduce((sum, arr) => sum + arr.length, 0),
  };
}

/* ─── Interactive SVG Graph ─────────────────────────────────────── */
function SchemaGraph({
  counts,
  selectedEntity,
  onSelect,
  hoveredRelation,
  onHoverRelation,
}: {
  counts: EntityCounts;
  selectedEntity: string | null;
  onSelect: (id: string) => void;
  hoveredRelation: number | null;
  onHoverRelation: (idx: number | null) => void;
}) {
  const width = 1020;
  const height = 720;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-5xl mx-auto"
      role="img"
      aria-label="CIDOC-CRM entity relationship diagram showing the Suriname Time Machine data model"
    >
      {/* Background */}
      <rect
        width={width}
        height={height}
        fill="#faf9f7"
        stroke="#ddd9d2"
        strokeWidth="1"
      />

      {/* Title */}
      <text
        x={width / 2}
        y="30"
        textAnchor="middle"
        className="text-sm font-bold fill-stm-warm-700"
      >
        Suriname Time Machine -- CIDOC-CRM Entity Model (16 classes, 27
        relations)
      </text>

      {/* Legend */}
      <g transform="translate(20, 695)">
        <circle
          cx="0"
          cy="0"
          r="8"
          fill="white"
          stroke="#c78e66"
          strokeWidth="2"
        />
        <text x="14" y="4" className="text-[9px] fill-stm-warm-500">
          Data-backed
        </text>
        <circle
          cx="110"
          cy="0"
          r="6"
          fill="white"
          stroke="#999"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />
        <text x="122" y="4" className="text-[9px] fill-stm-warm-500">
          Structural (inferred)
        </text>
      </g>

      {/* Relations */}
      {RELATIONS.map((rel, i) => {
        const from = ENTITIES.find((e) => e.id === rel.from)!;
        const to = ENTITIES.find((e) => e.id === rel.to)!;
        const isHighlighted = hoveredRelation === i;
        const mx = (from.cx + to.cx) / 2;
        const my = (from.cy + to.cy) / 2;

        // Offset label slightly for readability
        const dx = to.cx - from.cx;
        const dy = to.cy - from.cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const labelOffset = 14;

        const labelText = rel.label;
        const labelWidth = labelText.length * 5 + 10;

        return (
          <g
            key={i}
            onMouseEnter={() => onHoverRelation(i)}
            onMouseLeave={() => onHoverRelation(null)}
            className="cursor-pointer"
          >
            <line
              x1={from.cx}
              y1={from.cy}
              x2={to.cx}
              y2={to.cy}
              stroke={isHighlighted ? '#a67830' : '#c4beb4'}
              strokeWidth={isHighlighted ? 2.5 : 1.5}
              strokeDasharray={isHighlighted ? undefined : '6 3'}
            />
            {/* White background for label readability */}
            <rect
              x={mx + nx * labelOffset - labelWidth / 2}
              y={my + ny * labelOffset - 7}
              width={labelWidth}
              height={14}
              fill="#faf9f7"
              fillOpacity="0.9"
            />
            <text
              x={mx + nx * labelOffset}
              y={my + ny * labelOffset}
              textAnchor="middle"
              dominantBaseline="middle"
              className={`text-[9px] ${isHighlighted ? 'fill-stm-sepia-700 font-semibold' : 'fill-stm-warm-400'}`}
            >
              {labelText}
            </text>
          </g>
        );
      })}

      {/* Entity nodes */}
      {ENTITIES.map((ent) => {
        const isSelected = selectedEntity === ent.id;
        const isStructural = ent.structural;
        const r = isStructural ? 28 : 36;
        const count = ent.dataKey
          ? (counts[ent.dataKey as keyof EntityCounts] ?? 0)
          : null;
        return (
          <g
            key={ent.id}
            className="cursor-pointer"
            onClick={() => onSelect(ent.id)}
            role="button"
            tabIndex={0}
            aria-label={`${ent.label} (${ent.type})${count !== null ? `: ${count.toLocaleString()} entities` : ' (structural)'}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(ent.id);
            }}
          >
            {/* Glow for selected */}
            {isSelected && (
              <circle
                cx={ent.cx}
                cy={ent.cy}
                r={r + 10}
                fill={ent.color}
                fillOpacity={0.12}
              />
            )}
            {/* Node */}
            <circle
              cx={ent.cx}
              cy={ent.cy}
              r={r}
              fill="white"
              stroke={ent.color}
              strokeWidth={isSelected ? 3 : 2}
              strokeDasharray={isStructural ? '6 3' : undefined}
            />
            <circle
              cx={ent.cx}
              cy={ent.cy}
              r={r}
              fill={ent.color}
              fillOpacity={0.08}
            />
            {/* Type label */}
            <text
              x={ent.cx}
              y={ent.cy - (isStructural ? 6 : 10)}
              textAnchor="middle"
              className={`${isStructural ? 'text-[10px]' : 'text-[11px]'} font-bold`}
              fill={ent.color}
            >
              {ent.type}
            </text>
            {/* Name */}
            <text
              x={ent.cx}
              y={ent.cy + (isStructural ? 6 : 4)}
              textAnchor="middle"
              className={`${isStructural ? 'text-[8px]' : 'text-[10px]'} fill-stm-warm-600`}
            >
              {ent.label}
            </text>
            {/* Count or structural marker */}
            {!isStructural && count !== null && (
              <text
                x={ent.cx}
                y={ent.cy + 18}
                textAnchor="middle"
                className="text-[9px] fill-stm-warm-400"
              >
                {count.toLocaleString()}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Entity Detail Panel ──────────────────────────────────────── */
function EntityDetail({
  entity,
  count,
}: {
  entity: EntityDef;
  count: number | null;
}) {
  return (
    <div className="bg-white border border-stm-warm-200 p-6">
      <div className="flex items-start gap-4 mb-4">
        <div
          className="w-12 h-12 flex items-center justify-center font-bold text-sm shrink-0"
          style={{
            backgroundColor: entity.color,
            color: badgeTextColor(entity.color),
            border: entity.structural
              ? '2px dashed rgba(0,0,0,0.15)'
              : undefined,
          }}
        >
          {entity.type}
        </div>
        <div>
          <h3 className="font-serif text-xl font-bold text-stm-warm-800">
            {entity.label}
          </h3>
          <p className="text-sm text-stm-warm-400 font-mono">
            {entity.crmClass}
          </p>
        </div>
      </div>

      <p className="text-sm text-stm-warm-600 leading-relaxed mb-4">
        {entity.desc}
      </p>

      <div className="flex items-center gap-3 mb-5">
        {entity.structural ? (
          <span className="bg-stm-warm-100 text-stm-warm-500 px-3 py-1 text-sm italic">
            Structural class (inferred from data)
          </span>
        ) : (
          <span className="bg-stm-warm-100 text-stm-warm-700 px-3 py-1 text-sm font-semibold">
            {(count ?? 0).toLocaleString()} entities
          </span>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-stm-warm-700 mb-2">
          Properties
        </h4>
        <div className="border border-stm-warm-200 overflow-hidden">
          <table className="w-full text-xs" role="table">
            <thead>
              <tr className="bg-stm-warm-50 border-b border-stm-warm-200">
                <th className="text-left px-3 py-2 text-stm-warm-500 font-medium">
                  Property
                </th>
                <th className="text-left px-3 py-2 text-stm-warm-500 font-medium">
                  Range
                </th>
              </tr>
            </thead>
            <tbody>
              {entity.properties.map((prop, i) => (
                <tr
                  key={i}
                  className={i % 2 === 0 ? 'bg-white' : 'bg-stm-warm-50/50'}
                >
                  <td className="px-3 py-1.5 font-mono text-stm-sepia-700">
                    {prop.name}
                  </td>
                  <td className="px-3 py-1.5 text-stm-warm-600">
                    {prop.range}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Relation tooltip / detail ────────────────────────────────── */
function RelationDetail({ relation }: { relation: RelDef }) {
  const from = ENTITIES.find((e) => e.id === relation.from)!;
  const to = ENTITIES.find((e) => e.id === relation.to)!;
  return (
    <div className="bg-stm-sepia-50 border border-stm-sepia-200 p-4 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-7 h-7 text-[10px] font-bold flex items-center justify-center"
          style={{
            backgroundColor: from.color,
            color: badgeTextColor(from.color),
          }}
        >
          {from.type}
        </span>
        <span className="text-stm-sepia-500 font-mono text-xs">
          {relation.label}
        </span>
        <svg
          className="w-4 h-4 text-stm-sepia-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 7l5 5m0 0l-5 5m5-5H6"
          />
        </svg>
        <span
          className="w-7 h-7 text-[10px] font-bold flex items-center justify-center"
          style={{
            backgroundColor: to.color,
            color: badgeTextColor(to.color),
          }}
        >
          {to.type}
        </span>
      </div>
      <p className="text-stm-warm-600">{relation.desc}</p>
    </div>
  );
}

/* ─── Connection Chains Section ────────────────────────────────── */
function SourcePatternSection() {
  return (
    <div className="bg-white border border-stm-warm-200 p-6">
      <h3 className="font-serif text-xl font-bold text-stm-warm-800 mb-3">
        Connection Chains
      </h3>
      <p className="text-sm text-stm-warm-600 leading-relaxed mb-4">
        All information flows through sources. Maps, almanacs, and registers are
        modeled as E22 Human-Made Objects. Each source carries appellations
        (E41) that identify entities, and visual items (E36) that represent
        physical plantations (E25). The key principle:{' '}
        <strong>maps depict things; things have locations</strong>.
      </p>
      <div className="bg-stm-warm-50 p-4 font-mono text-xs text-stm-warm-600 space-y-2.5">
        <div>
          <span className="text-stm-warm-400">Source:</span>{' '}
          <span style={{ color: '#c78e66' }}>E22 Map</span>
          {' -> P128 -> '}
          <span style={{ color: '#d4a574' }}>E36 Visual Item</span>
          {' -> P138 -> '}
          <span style={{ color: '#e6956b' }}>E25 Plantation</span>
        </div>
        <div>
          <span className="text-stm-warm-400">Name:</span>{' '}
          <span style={{ color: '#c78e66' }}>E22 Almanac</span>
          {' -> P128 -> '}
          <span style={{ color: '#b5a200' }}>E41 Name</span>
          {' -> P1i -> '}
          <span style={{ color: '#d4829a' }}>E74 Organization</span>
        </div>
        <div>
          <span className="text-stm-warm-400">Location:</span>{' '}
          <span style={{ color: '#e6956b' }}>E25 Plantation</span>
          {' -> P53 -> '}
          <span style={{ color: '#6aad55' }}>E53 Place</span>
          {' -> geo:hasGeometry -> geo:asWKT -> POLYGON(...)'}
        </div>
        <div>
          <span className="text-stm-warm-400">Ownership:</span>{' '}
          <span style={{ color: '#e6956b' }}>E25 Plantation</span>
          {' -> P52 -> '}
          <span style={{ color: '#d4829a' }}>E74 Organization</span>
          {' (wd:Q-ID)'}
        </div>
        <div>
          <span className="text-stm-warm-400">Time:</span>{' '}
          <span style={{ color: '#4ab3e6' }}>E13 Attr. Assign.</span>
          {' -> P4 -> '}
          <span style={{ color: '#6ba3cc' }}>E52 Time-Span</span>
          {' (year) + P140 -> '}
          <span style={{ color: '#d4829a' }}>E74</span>
          {' = "what happened when"'}
        </div>
        <div>
          <span className="text-stm-warm-400">People:</span>{' '}
          <span style={{ color: '#4ab3e6' }}>E13 Attr. Assign.</span>
          {' -> P14 -> '}
          <span style={{ color: '#cc8e99' }}>E39 Actor</span>
          {' + pico:hasRole -> picot:owner/admin/director'}
        </div>
        <div>
          <span className="text-stm-warm-400">Measurement:</span>{' '}
          <span style={{ color: '#4ab3e6' }}>E13 Attr. Assign.</span>
          {' -> P43 -> '}
          <span style={{ color: '#9b8abd' }}>E54 Dimension</span>
          {' (size in akkers)'}
        </div>
        <div>
          <span className="text-stm-warm-400">Types:</span>{' '}
          <span style={{ color: '#4ab3e6' }}>E13 Attr. Assign.</span>
          {' -> P141 -> '}
          <span style={{ color: '#5e9e52' }}>E55 Type</span>
          {' (product / deserted)'}
        </div>
        <div>
          <span className="text-stm-warm-400">Digital:</span>{' '}
          <span style={{ color: '#d4a574' }}>E36 Visual Item</span>
          {' -> P138 -> '}
          <span style={{ color: '#c78e66' }}>E22 Source</span>
          {' (IIIF scan of physical source)'}
        </div>
        <div>
          <span className="text-stm-warm-400">Merger:</span>{' '}
          <span style={{ color: '#e6956b' }}>E25 Plantation</span>
          {' -> P124 -> '}
          <span style={{ color: '#cc7070' }}>E81 Transformation</span>
          {' -> P123 -> '}
          <span style={{ color: '#e6956b' }}>E25 Plantation</span>
          {' (merged)'}
        </div>
        <div>
          <span className="text-stm-warm-400">Absorption:</span>{' '}
          <span style={{ color: '#d4829a' }}>E74 Organization</span>
          {' -> P99i -> '}
          <span style={{ color: '#b87070' }}>E68 Dissolution</span>
          {' -> P14 -> '}
          <span style={{ color: '#d4829a' }}>E74 Organization</span>
          {' (successor)'}
        </div>
        <div>
          <span className="text-stm-warm-400">Identifier:</span>{' '}
          <span style={{ color: '#d4829a' }}>E74 Organization</span>
          {' -> P48 -> '}
          <span style={{ color: '#8aa4be' }}>E42 Identifier</span>
          {' (Wikidata Q-ID / PSUR ID)'}
        </div>
      </div>
    </div>
  );
}

/* ─── Spatial Model Section ───────────────────────────────────── */
function SpatialModelSection() {
  return (
    <div className="bg-white border border-stm-warm-200 p-6">
      <h3 className="font-serif text-xl font-bold text-stm-warm-800 mb-3">
        Spatial Model
      </h3>
      <p className="text-sm text-stm-warm-600 leading-relaxed mb-4">
        Plantation locations are digitized as polygons from the 1930 Bos &
        Weyerman map using QGIS. The source coordinate reference system is{' '}
        <strong>EPSG:31170</strong> (Suriname Old TM), which must be reprojected
        to <strong>WGS84 (EPSG:4326)</strong> for web display.
      </p>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold text-stm-warm-700 mb-2">
            CRS Reprojection Pipeline
          </h4>
          <div className="bg-stm-warm-50 p-4 font-mono text-xs text-stm-warm-600 space-y-1.5">
            <div>
              <span className="text-stm-warm-400">Source CRS:</span> EPSG:31170
              (Suriname Old TM)
            </div>
            <div>
              <span className="text-stm-warm-400">Datum shift:</span>{' '}
              +towgs84=-265,120,-358,0,0,0,0
            </div>
            <div>
              <span className="text-stm-warm-400">Target CRS:</span> EPSG:4326
              (WGS84)
            </div>
            <div>
              <span className="text-stm-warm-400">Projection:</span> Transverse
              Mercator
            </div>
            <div>
              <span className="text-stm-warm-400">Central meridian:</span>{' '}
              -55.68333
            </div>
            <div>
              <span className="text-stm-warm-400">False easting:</span> 500,000
              m
            </div>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-stm-warm-700 mb-2">
            GeoSPARQL Storage
          </h4>
          <div className="bg-stm-warm-50 p-4 font-mono text-xs text-stm-warm-600 space-y-1.5">
            <div className="mb-2">
              <span style={{ color: '#e6956b' }}>E25</span>
              {' -> P53 -> '}
              <span style={{ color: '#6aad55' }}>E53 Place</span>
            </div>
            <div className="ml-4">
              <span style={{ color: '#6aad55' }}>E53</span>
              {' -> geo:hasGeometry -> geo:Geometry'}
            </div>
            <div className="ml-8">{'-> geo:asWKT'}</div>
            <div className="ml-12">
              <span className="text-stm-sepia-600 break-all">
                &quot;POLYGON((...))&quot;
              </span>
              <br />
              <span className="text-stm-sepia-600">^^geo:wktLiteral</span>
            </div>
            <div className="mt-2 text-stm-warm-500">
              Centroids computed for Leaflet map markers
            </div>
          </div>
          <div className="mt-3">
            <h4 className="text-sm font-semibold text-stm-warm-700 mb-2">
              E13 Location (text only)
            </h4>
            <p className="text-xs text-stm-warm-500">
              Almanac P7 &quot;took place at&quot; values are text strings (e.g.
              &quot;Boven-Commewijne&quot;, &quot;Beneden-Suriname&quot;). These
              are <strong>not yet linked</strong> to E53 polygon geometries.
              Georeferencing almanac location strings to map polygons is a
              future research task.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Temporal Model Section ──────────────────────────────────── */
function TemporalModelSection() {
  return (
    <div className="bg-white border border-stm-warm-200 p-6">
      <h3 className="font-serif text-xl font-bold text-stm-warm-800 mb-3">
        Temporal Model
      </h3>
      <p className="text-sm text-stm-warm-600 leading-relaxed mb-4">
        Time is modeled through E52 Time-Span linked to E13 observations. Each
        almanac row is tied to a specific year. Map dates provide temporal scope
        for names.
      </p>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold text-stm-warm-700 mb-2">
            Observation Time
          </h4>
          <div className="bg-stm-warm-50 p-4 font-mono text-xs text-stm-warm-600 space-y-1.5">
            <div>
              <span style={{ color: '#4ab3e6' }}>E13 Attr. Assign.</span>
              {' -> P4 has time-span -> '}
              <span style={{ color: '#6ba3cc' }}>E52</span>
            </div>
            <div className="ml-4">
              <span style={{ color: '#6ba3cc' }}>E52</span>
              {' -> P82 at some time within -> xsd:gYear'}
            </div>
            <div className="mt-3 text-stm-warm-500">
              Almanac coverage: ~1750-1863
            </div>
            <div className="text-stm-warm-500">
              Each E13 records one year of observation
            </div>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-stm-warm-700 mb-2">
            Name Dating
          </h4>
          <div className="bg-stm-warm-50 p-4 font-mono text-xs text-stm-warm-600 space-y-1.5">
            <div>
              <span style={{ color: '#c78e66' }}>E22 Source</span>
              {' -> P108i was produced by -> E12 -> P4 has time-span -> E52'}
            </div>
            <div className="mt-1 text-stm-warm-500">
              The production date of the source provides temporal scope for the
              E41 names it carries.
            </div>
            <div className="mt-3 font-sans text-stm-warm-500">
              Map sources: 1930 (primary, QGIS polygons), 1860-79 (historical
              name labels)
            </div>
          </div>
          <div className="mt-3">
            <h4 className="text-sm font-semibold text-stm-warm-700 mb-2">
              Plantation Mergers (E81)
            </h4>
            <p className="text-xs text-stm-warm-500">
              When plantations merge, <strong>E81 Transformation</strong>{' '}
              simultaneously ends old E25 entities (P124 transformed) and
              produces the merged E25 (P123 resulted in). For example,
              Suzanna&apos;sdal and Geijersvlijt merging into one plantation.
            </p>
          </div>
          <div className="mt-3">
            <h4 className="text-sm font-semibold text-stm-warm-700 mb-2">
              Organization Absorption (E68)
            </h4>
            <p className="text-xs text-stm-warm-500">
              When one organization absorbs another,{' '}
              <strong>E68 Dissolution</strong> (P99 dissolved) ends the old E74.
              The absorbing E74 acts as agent via P14 carried out by.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────────── */
export default function ModelPage() {
  const [counts, setCounts] = useState<EntityCounts | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>('e25');
  const [hoveredRelation, setHoveredRelation] = useState<number | null>(null);

  useEffect(() => {
    fetchCounts().then(setCounts);
  }, []);

  const selectedDef = useMemo(
    () => ENTITIES.find((e) => e.id === selectedEntity) || null,
    [selectedEntity],
  );

  if (!counts) {
    return (
      <div className="h-full flex items-center justify-center bg-stm-warm-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-stm-sepia-400 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-stm-warm-500 text-sm">Loading data model...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-stm-warm-50">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stm-warm-800 mb-3">
            Data Model
          </h1>
          <p className="text-stm-warm-500 max-w-3xl leading-relaxed">
            The Suriname Time Machine uses CIDOC-CRM to model cultural heritage
            entities. Click any node in the graph to see its properties and
            relationships. Hover over connections to highlight the CIDOC-CRM
            property linking two entities. Dashed nodes are structural classes
            inferred from the data model but not directly stored as entities.
          </p>
        </div>

        {/* Schema Graph */}
        <div className="mb-10">
          <SchemaGraph
            counts={counts}
            selectedEntity={selectedEntity}
            onSelect={setSelectedEntity}
            hoveredRelation={hoveredRelation}
            onHoverRelation={setHoveredRelation}
          />
        </div>

        {/* Relation detail (when hovering) */}
        {hoveredRelation !== null && (
          <div className="mb-6">
            <RelationDetail relation={RELATIONS[hoveredRelation]} />
          </div>
        )}

        {/* Entity detail + Connection chains */}
        <div className="grid lg:grid-cols-2 gap-6 mb-10">
          {selectedDef && (
            <EntityDetail
              entity={selectedDef}
              count={
                selectedDef.dataKey
                  ? (counts[selectedDef.dataKey as keyof EntityCounts] ?? 0)
                  : null
              }
            />
          )}
          <SourcePatternSection />
        </div>

        {/* Spatial + Temporal models */}
        <div className="grid lg:grid-cols-2 gap-6 mb-10">
          <SpatialModelSection />
          <TemporalModelSection />
        </div>

        {/* All entities quick reference */}
        <div className="mb-10">
          <h2 className="font-serif text-2xl font-bold text-stm-warm-800 mb-2">
            All Entity Types
          </h2>
          <p className="text-sm text-stm-warm-500 mb-4">
            6 data-backed classes with entity counts, 10 structural classes
            inferred from the model.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ENTITIES.map((ent) => {
              const count = ent.dataKey
                ? (counts[ent.dataKey as keyof EntityCounts] ?? 0)
                : null;
              return (
                <button
                  key={ent.id}
                  onClick={() => {
                    setSelectedEntity(ent.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`text-left bg-white border p-4 transition-all hover:shadow-md ${
                    selectedEntity === ent.id
                      ? 'border-stm-sepia-400 shadow-md ring-1 ring-stm-sepia-200'
                      : 'border-stm-warm-200'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="w-8 h-8 text-[10px] font-bold flex items-center justify-center"
                      style={{
                        backgroundColor: ent.color,
                        color: badgeTextColor(ent.color),
                        border: ent.structural
                          ? '2px dashed rgba(0,0,0,0.15)'
                          : undefined,
                      }}
                    >
                      {ent.type}
                    </span>
                    <div>
                      <span className="font-semibold text-stm-warm-800 text-sm">
                        {ent.label}
                      </span>
                      {count !== null ? (
                        <span className="text-stm-warm-400 text-xs ml-2">
                          {count.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-stm-warm-400 text-xs ml-2 italic">
                          structural
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-stm-warm-500 line-clamp-2">
                    {ent.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Research Questions */}
        <div className="bg-white border border-stm-warm-200 p-6 mb-10">
          <h3 className="font-serif text-xl font-bold text-stm-warm-800 mb-2">
            Research Questions
          </h3>
          <p className="text-sm text-stm-warm-500 mb-4">
            Questions the data model can support. Status indicates whether the
            current data and connections are sufficient to answer each question.
          </p>
          <div className="space-y-3">
            {[
              {
                status: 'green' as const,
                question: 'What products were grown at a plantation over time?',
                path: 'E13 -> P141 assigned -> E55 Type (product) + P4 has time-span -> E52',
              },
              {
                status: 'red' as const,
                question:
                  'How did the number of enslaved people change per plantation?',
                path: 'Deferred -- requires PICO integration for person-level modeling (not simple E54 counts)',
              },
              {
                status: 'green' as const,
                question:
                  'Who owned or administered a plantation in a given year?',
                path: 'E13 -> P14 carried out by -> E39 Actor + P4 -> E52',
              },
              {
                status: 'green' as const,
                question:
                  'Which plantations were marked as deserted (verlaten)?',
                path: 'E17 Type Assignment -> P41 classified -> E25 + P42 assigned -> E55 (abandoned)',
              },
              {
                status: 'green' as const,
                question: 'Where was a plantation located on the 1930 map?',
                path: 'E25 -> P53 -> E53 Place -> geo:hasGeometry -> geo:asWKT',
              },
              {
                status: 'green' as const,
                question: 'What was the size of a plantation in akkers?',
                path: 'E13 -> P43 -> E54 Dimension (P90 has value + P91 has unit)',
              },
              {
                status: 'amber' as const,
                question: 'Did people move between plantations over time?',
                path: 'Requires entity resolution: same E39 Actor name appearing in multiple E13 assignments across different E74 organizations',
              },
              {
                status: 'amber' as const,
                question: 'Which organizations merged or were absorbed?',
                path: 'E74 -> P99i was dissolved by -> E68 Dissolution (partial data; needs more historical sources)',
              },
              {
                status: 'amber' as const,
                question: 'Can almanac locations be linked to map polygons?',
                path: 'E13 P7 text -> gazetteer resolution -> E53 Place (geo:asWKT). Needs NLP + historical gazetteer',
              },
              {
                status: 'red' as const,
                question: 'What were the living conditions of enslaved people?',
                path: 'Needs connection to slave registers (dataset 05) via PSUR IDs -> E21 Person',
              },
              {
                status: 'red' as const,
                question:
                  'How did plantation boundaries change over centuries?',
                path: 'Needs multiple historical maps with georeferenced polygons per time period',
              },
            ].map((q, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span
                  className={`inline-block w-2 h-2 mt-1.5 shrink-0 ${
                    q.status === 'green'
                      ? 'bg-green-500'
                      : q.status === 'amber'
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-stm-warm-700 font-medium">{q.question}</p>
                  <p className="text-[11px] text-stm-warm-400 font-mono mt-0.5">
                    {q.path}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-4 text-[11px] text-stm-warm-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 bg-green-500" /> Answerable
              now
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 bg-amber-500" /> Needs
              entity resolution
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 bg-red-500" /> Needs new
              data sources
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
