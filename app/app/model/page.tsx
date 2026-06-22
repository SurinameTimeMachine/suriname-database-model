'use client';

import { CRM_COLORS } from '@/lib/data';
import { useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/* ─── Helpers ──────────────────────────────────────────────────── */

/** Colors that need dark text for contrast */
const LIGHT_BG = new Set([
  CRM_COLORS['E41'],
  CRM_COLORS['E39'],
  CRM_COLORS['E74'],
  CRM_COLORS['E55'],
  CRM_COLORS['E52'],
  CRM_COLORS['E54'],
  CRM_COLORS['PROV'],
  CRM_COLORS['E13'],
  CRM_COLORS['E42'],
  CRM_COLORS['E17'],
  CRM_COLORS['E68'],
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
    label: 'Human-Made Feature',
    crmClass: 'E25 Human-Made Feature',
    desc: 'The central entity for all human-made landscape features: plantation polygons, road and railroad lines, military posts, stations, settlements, towns, and named villages. Plantations are the ownership-bearing E25 subtype and connect to organizations via P52; all E25 instances connect to an E53 location via P53 and are classified through the geographical-feature thesaurus.',
    color: CRM_COLORS.E25,
    cx: 380,
    cy: 330,
    dataKey: 'e25-features',
    properties: [
      { name: 'P1 is identified by', range: 'E41 Appellation' },
      { name: 'rdfs:label', range: 'string (@nl)' },
      { name: 'P2 has type', range: 'E55 Type / SKOS concept' },
      {
        name: 'P53 has location',
        range: 'E53 Place (Polygon, LineString, or Point geometry)',
      },
      {
        name: 'P52 has current owner',
        range: 'E74 Organization (plantations only)',
      },
      {
        name: 'P51 has former or current owner',
        range: 'E74 Organization (plantations only)',
      },
      {
        name: 'P124i was transformed by',
        range: 'E81 Transformation (merger)',
      },
      {
        name: 'P138i has representation',
        range: 'E36 Visual Item (via source)',
      },
      {
        name: 'lifecycleEvents',
        range: 'E17/E11/E6/E12/E81 event index',
      },
    ],
  },
  {
    id: 'e26',
    type: 'E26',
    label: 'Natural Feature',
    crmClass: 'E26 Physical Feature',
    desc: 'Natural geographical features such as rivers and creeks. E26 is the superclass of E25, but the data keeps natural waterways separate from human-made features because they do not have owners or plantation lifecycle events. Each E26 connects to an E53 LineString location via P53 and is typed through the thesaurus.',
    color: CRM_COLORS.E26,
    cx: 150,
    cy: 330,
    dataKey: 'e26-features',
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
    color: CRM_COLORS.E74,
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
    desc: 'Spatial location entity for every mapped feature. Plantation locations use Polygon geometry, roads and waterways use LineString or MultiLineString geometry, and settlements, stations, military posts, towns, and villages use Point geometry. Source coordinates are normalized to WGS84 and stored as GeoSPARQL WKT literals.',
    color: CRM_COLORS.E53,
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
      { name: 'geo:hasGeometry', range: 'geo:Geometry' },
      { name: 'geo:asWKT', range: 'wktLiteral (Point/LineString/Polygon)' },
      { name: 'P70i is documented in', range: 'E22 Source (map)' },
    ],
  },
  {
    id: 'e41',
    type: 'E41',
    label: 'Appellation',
    crmClass: 'E41 Appellation',
    desc: 'Names as first-class entities. Each source creates its own E41 instance. Map labels identify E25; almanac names identify E74. Temporal scope is inferred from the E22 source production date. Linked via P139 has alternative form.',
    color: CRM_COLORS.E41,
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
    color: CRM_COLORS.E22,
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
    color: CRM_COLORS.E13,
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
    desc: 'Time-scoped classification for any mapped feature. E17 records source presence, lifecycle status (built, present, abandoned, reactivated), and functional or use assignments. It targets the feature with P41 classified and assigns an E55 type with P42 assigned.',
    color: CRM_COLORS.E17,
    cx: 400,
    cy: 490,
    dataKey: 'e17-events',
    properties: [
      { name: 'P41 classified', range: 'E25 / E26 / E53 feature' },
      { name: 'P42 assigned', range: 'E55 Type (status, presence, function)' },
      { name: 'P4 has time-span', range: 'E52 Time-Span (year)' },
      { name: 'prov:hadPrimarySource', range: 'E22 Source' },
    ],
  },
  {
    id: 'e36',
    type: 'E36',
    label: 'Visual Item',
    crmClass: 'E36 Visual Item',
    desc: 'The visual content carried by a source. A map (E22) carries a visual item (E36) that represents the physical plantation (E25). This intermediary class enables the principle: "maps depict things; things have locations." Digital reproductions (IIIF scans) are also E36 Visual Items that represent the physical source (E22) via P138.',
    color: CRM_COLORS.E36,
    cx: 380,
    cy: 160,
    dataKey: '',
    structural: true,
    properties: [
      { name: 'P138 represents', range: 'E25 Human-Made Feature' },
      {
        name: 'P138 represents',
        range: 'E22 Human-Made Object (digital scan)',
      },
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
    color: CRM_COLORS.E52,
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
    color: CRM_COLORS.E39,
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
    color: CRM_COLORS.E55,
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
    color: CRM_COLORS.E54,
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
    desc: 'The production event of a physical source (E22), and the lifecycle event used when a building or other human-made feature is newly erected. Records who made something (P14), where (P7), and when (P4).',
    color: CRM_COLORS.E12,
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
    color: CRM_COLORS.E42,
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
    desc: "Models plantation mergers and road merges. When plantations or roads merge, E81 simultaneously ends old E25 entities and produces the merged E25. For example, Suzanna'sdal and Geijersvlijt merging into one plantation by 1930.",
    color: CRM_COLORS.E81,
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
    id: 'e11',
    type: 'E11',
    label: 'Modification',
    crmClass: 'E11 Modification',
    desc: "Records a change to an existing feature while the same feature continues: re-routing a road, changing a building layout, extending a footprint, or altering a point feature's documented form. The E11 provides provenance and timing; changed geometry is represented by a new or updated E53 location.",
    color: CRM_COLORS.E11,
    cx: 180,
    cy: 460,
    dataKey: '',
    structural: true,
    properties: [
      { name: 'P31 has modified', range: 'E25 / E26 feature' },
      { name: 'P4 has time-span', range: 'E52 Time-Span' },
      { name: 'prov:hadPrimarySource', range: 'E22 Human-Made Object' },
    ],
  },
  {
    id: 'e6',
    type: 'E6',
    label: 'Destruction',
    crmClass: 'E6 Destruction',
    desc: 'Records the end or loss of a physical feature: a road removed, a building burned down, or a structure demolished. Unlike E81 Transformation, no successor entity is required; if something new is erected, that is modeled as a new E25 with its own production event.',
    color: CRM_COLORS.E6,
    cx: 180,
    cy: 540,
    dataKey: '',
    structural: true,
    properties: [
      { name: 'P13 destroyed', range: 'E25 / E26 feature' },
      { name: 'P4 has time-span', range: 'E52 Time-Span' },
      { name: 'prov:hadPrimarySource', range: 'E22 Human-Made Object' },
    ],
  },
  {
    id: 'e68',
    type: 'E68',
    label: 'Dissolution',
    crmClass: 'E68 Dissolution',
    desc: 'Models when an organization (E74) is absorbed by another. The dissolved organization ceases to exist; the absorbing organization acts as agent of the dissolution via P14 carried out by.',
    color: CRM_COLORS.E68,
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
    desc: 'Plantation E25 instances can be owned or operated by an organization',
  },
  {
    from: 'e25',
    to: 'e53',
    label: 'P53 has location',
    desc: 'The human-made feature is located at an E53 place with Polygon, LineString, MultiLineString, or Point geometry',
  },
  {
    from: 'e25',
    to: 'e41',
    label: 'P1 is identified by',
    desc: 'The human-made feature is identified by this name from a map, gazetteer, or source label',
  },
  {
    from: 'e26',
    to: 'e53',
    label: 'P53 has location',
    desc: 'The natural feature is located at this place (usually LineString geometry from the map pipeline)',
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
  {
    from: 'e11',
    to: 'e25',
    label: 'P31 has modified',
    desc: 'E11 Modification: the road (E25) whose geometry was changed by re-routing or extension',
  },
  {
    from: 'e6',
    to: 'e25',
    label: 'P13 destroyed',
    desc: 'E6 Destruction: the road (E25) that was permanently removed from the landscape',
  },
];

/* ─── Data fetching ────────────────────────────────────────────── */
interface EntityCounts {
  plantations: number;
  'physical-features': number;
  'e25-features': number;
  'e26-features': number;
  'e17-events': number;
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
    lifecycleEvents,
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
    fetch(`${DATA_BASE}/lifecycle-events.json`)
      .then((r) => r.json())
      .catch(() => ({})),
  ]);

  const physicalFeatureValues = Object.values(
    physicalFeatures as Record<string, { '@type'?: string[] }>,
  );
  const e25GazetteerFeatures = physicalFeatureValues.filter((feature) =>
    (feature['@type'] ?? []).some((type) => type.includes('E25')),
  ).length;
  const e26Features = physicalFeatureValues.filter((feature) =>
    (feature['@type'] ?? []).some((type) => type.includes('E26')),
  ).length;
  const lifecycleEventValues = Object.values(
    lifecycleEvents as Record<string, Array<{ crmClass?: string }>>,
  ).flat();

  return {
    plantations: Object.keys(plantations).length,
    'physical-features': Object.keys(physicalFeatures).length,
    'e25-features': Object.keys(plantations).length + e25GazetteerFeatures,
    'e26-features': e26Features,
    'e17-events': lifecycleEventValues.filter(
      (event) => event.crmClass === 'E17',
    ).length,
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
          stroke={CRM_COLORS['E22']}
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
      {RELATIONS.map((rel) => {
        const from = ENTITIES.find((e) => e.id === rel.from)!;
        const to = ENTITIES.find((e) => e.id === rel.to)!;
        const isHighlighted = hoveredRelation === `${rel.from}-${rel.to}`;
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
            key={`${rel.from}-${rel.to}`}
            onMouseEnter={() => onHoverRelation(`${rel.from}-${rel.to}`)}
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
    <div className="site-surface p-6">
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
          <h3 className="text-xl font-semibold text-ink">{entity.label}</h3>
          <p className="font-mono text-sm text-ink/45">{entity.crmClass}</p>
        </div>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-ink/65">{entity.desc}</p>

      <div className="flex items-center gap-3 mb-5">
        {entity.structural ? (
          <span className="bg-background px-3 py-1 text-sm italic text-ink/55">
            Structural class (inferred from data)
          </span>
        ) : (
          <span className="bg-background px-3 py-1 text-sm font-semibold text-ink/75">
            {(count ?? 0).toLocaleString()} entities
          </span>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink/75">Properties</h4>
        <div className="overflow-hidden site-surface">
          <table className="w-full text-xs" role="table">
            <thead>
              <tr className="border-b border-ink/10 bg-background">
                <th className="px-3 py-2 text-left font-medium uppercase tracking-[0.2em] text-ink/55">
                  Property
                </th>
                <th className="px-3 py-2 text-left font-medium uppercase tracking-[0.2em] text-ink/55">
                  Range
                </th>
              </tr>
            </thead>
            <tbody>
              {entity.properties.map((prop) => (
                <tr
                  key={prop.name}
                  className={
                    entity.properties.indexOf(prop) % 2 === 0
                      ? 'bg-cream/70'
                      : 'bg-background/60'
                  }
                >
                  <td className="px-3 py-1.5 font-mono text-teal-strong">
                    {prop.name}
                  </td>
                  <td className="px-3 py-1.5 text-ink/70">{prop.range}</td>
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
    <div className="site-surface p-4 text-sm">
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
        <span className="font-mono text-xs text-teal-strong">
          {relation.label}
        </span>
        <svg
          className="h-4 w-4 text-ink/40"
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
      <p className="text-ink/70">{relation.desc}</p>
    </div>
  );
}

/* ─── Connection Chains Section ────────────────────────────────── */
function SourcePatternSection() {
  return (
    <div className="site-surface p-6">
      <h3 className="mb-3 text-xl font-semibold text-ink">Connection Chains</h3>
      <p className="mb-4 text-sm leading-relaxed text-ink/65">
        All information flows through sources. Maps, almanacs, and registers are
        modeled as E22 Human-Made Objects. Each source carries appellations
        (E41) that identify entities, and visual items (E36) that represent
        physical plantations (E25). The key principle:{' '}
        <strong>maps depict things; things have locations</strong>.
      </p>
      <div className="space-y-2.5 bg-background p-4 font-mono text-xs text-ink/65">
        <div>
          <span className="text-ink/45">Source:</span>{' '}
          <span style={{ color: CRM_COLORS.E22 }}>E22 Map</span>
          {' -> P128 -> '}
          <span style={{ color: CRM_COLORS.E36 }}>E36 Visual Item</span>
          {' -> P138 -> '}
          <span style={{ color: CRM_COLORS.E25 }}>E25 Plantation</span>
        </div>
        <div>
          <span className="text-ink/45">Name:</span>{' '}
          <span style={{ color: CRM_COLORS.E22 }}>E22 Almanac</span>
          {' -> P128 -> '}
          <span style={{ color: CRM_COLORS.E41 }}>E41 Name</span>
          {' -> P1i -> '}
          <span style={{ color: CRM_COLORS.E74 }}>E74 Organization</span>
        </div>
        <div>
          <span className="text-ink/45">Location:</span>{' '}
          <span style={{ color: CRM_COLORS.E25 }}>E25 Plantation</span>
          {' -> P53 -> '}
          <span style={{ color: CRM_COLORS.E53 }}>E53 Place</span>
          {' -> geo:hasGeometry -> geo:asWKT -> POLYGON(...)'}
        </div>
        <div>
          <span className="text-ink/45">Ownership:</span>{' '}
          <span style={{ color: CRM_COLORS.E25 }}>E25 Plantation</span>
          {' -> P52 -> '}
          <span style={{ color: CRM_COLORS.E74 }}>E74 Organization</span>
          {' (wd:Q-ID)'}
        </div>
        <div>
          <span className="text-ink/45">Time:</span>{' '}
          <span style={{ color: CRM_COLORS.E13 }}>E13 Attr. Assign.</span>
          {' -> P4 -> '}
          <span style={{ color: CRM_COLORS.E52 }}>E52 Time-Span</span>
          {' (year) + P140 -> '}
          <span style={{ color: CRM_COLORS.E74 }}>E74</span>
          {' = "what happened when"'}
        </div>
        <div>
          <span className="text-ink/45">People:</span>{' '}
          <span style={{ color: CRM_COLORS.E13 }}>E13 Attr. Assign.</span>
          {' -> P14 -> '}
          <span style={{ color: CRM_COLORS.E39 }}>E39 Actor</span>
          {' + pico:hasRole -> picot:owner/admin/director'}
        </div>
        <div>
          <span className="text-ink/45">Measurement:</span>{' '}
          <span style={{ color: CRM_COLORS.E13 }}>E13 Attr. Assign.</span>
          {' -> P43 -> '}
          <span style={{ color: CRM_COLORS.E54 }}>E54 Dimension</span>
          {' (size in akkers)'}
        </div>
        <div>
          <span className="text-ink/45">Types:</span>{' '}
          <span style={{ color: CRM_COLORS.E13 }}>E13 Attr. Assign.</span>
          {' -> P141 -> '}
          <span style={{ color: CRM_COLORS.E55 }}>E55 Type</span>
          {' (product / deserted)'}
        </div>
        <div>
          <span className="text-ink/45">Production:</span>{' '}
          <span style={{ color: CRM_COLORS.E12 }}>E12 Production</span>
          {' -> P108 -> '}
          <span style={{ color: CRM_COLORS.E22 }}>E22 Map</span>
          {' (P14: maker, P7: Den Haag/Paramaribo, P4: year)'}
        </div>
        <div>
          <span className="text-ink/45">Digital:</span>{' '}
          <span style={{ color: CRM_COLORS.E36 }}>E36 Visual Item</span>
          {' -> P138 -> '}
          <span style={{ color: CRM_COLORS.E22 }}>E22 Source</span>
          {' (IIIF scan of physical source)'}
        </div>
        <div>
          <span className="text-ink/45">Merger:</span>{' '}
          <span style={{ color: CRM_COLORS.E25 }}>E25 Plantation</span>
          {' -> P124 -> '}
          <span style={{ color: CRM_COLORS.E81 }}>E81 Transformation</span>
          {' -> P123 -> '}
          <span style={{ color: CRM_COLORS.E25 }}>E25 Plantation</span>
          {' (merged)'}
        </div>
        <div>
          <span className="text-ink/45">Absorption:</span>{' '}
          <span style={{ color: CRM_COLORS.E74 }}>E74 Organization</span>
          {' -> P99i -> '}
          <span style={{ color: CRM_COLORS.E68 }}>E68 Dissolution</span>
          {' -> P14 -> '}
          <span style={{ color: CRM_COLORS.E74 }}>E74 Organization</span>
          {' (successor)'}
        </div>
        <div>
          <span className="text-ink/45">Identifier:</span>{' '}
          <span style={{ color: CRM_COLORS.E74 }}>E74 Organization</span>
          {' -> P48 -> '}
          <span style={{ color: CRM_COLORS.E42 }}>E42 Identifier</span>
          {' (Wikidata Q-ID / PSUR ID)'}
        </div>
      </div>
    </div>
  );
}

/* ─── Spatial Model Section ───────────────────────────────────── */
function SpatialModelSection() {
  return (
    <div className="site-surface p-6">
      <h3 className="mb-3 text-xl font-semibold text-ink">Spatial Model</h3>
      <p className="mb-4 text-sm leading-relaxed text-ink/65">
        Mapped features are separated from their geometry. Plantations, roads,
        settlements, stations, military posts, towns, villages, rivers, and
        creeks are modeled as E25 or E26 feature entities; each feature points
        via <strong>P53 has location</strong> to an E53 Place carrying the
        actual GeoSPARQL geometry. Source coordinates from the QGIS map layers
        use <strong>EPSG:31170</strong> (Suriname Old TM) and are reprojected to{' '}
        <strong>WGS84 (EPSG:4326)</strong> for web display.
      </p>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink/75">
            CRS Reprojection Pipeline
          </h4>
          <div className="bg-background p-4 font-mono text-xs text-ink/65 space-y-1.5">
            <div>
              <span className="text-ink/45">Source CRS:</span> EPSG:31170
              (Suriname Old TM)
            </div>
            <div>
              <span className="text-ink/45">Datum shift:</span>{' '}
              +towgs84=-265,120,-358,0,0,0,0
            </div>
            <div>
              <span className="text-ink/45">Target CRS:</span> EPSG:4326 (WGS84)
            </div>
            <div>
              <span className="text-ink/45">Projection:</span> Transverse
              Mercator
            </div>
            <div>
              <span className="text-ink/45">Central meridian:</span> -55.68333
            </div>
            <div>
              <span className="text-ink/45">False easting:</span> 500,000 m
            </div>
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink/75">
            GeoSPARQL Storage
          </h4>
          <div className="bg-background p-4 font-mono text-xs text-ink/65 space-y-1.5">
            <div className="mb-2">
              <span style={{ color: CRM_COLORS['E25'] }}>E25</span>
              {' / '}
              <span style={{ color: CRM_COLORS['E26'] }}>E26</span>
              {' -> P53 -> '}
              <span style={{ color: CRM_COLORS['E53'] }}>E53 Place</span>
            </div>
            <div className="ml-4">
              <span style={{ color: CRM_COLORS['E53'] }}>E53</span>
              {' -> geo:hasGeometry -> geo:Geometry'}
            </div>
            <div className="ml-8">{'-> geo:asWKT'}</div>
            <div className="ml-12">
              <span className="text-stm-sepia-600 break-all">
                &quot;POINT(...) / LINESTRING(...) / POLYGON(...)&quot;
              </span>
              <br />
              <span className="text-stm-sepia-600">^^geo:wktLiteral</span>
            </div>
            <div className="mt-2 text-ink/55">
              Leaflet renders these as points, lines, and polygons from the same
              E53 geometry model
            </div>
          </div>
          <div className="mt-3">
            <h4 className="mb-2 text-sm font-semibold text-ink/75">
              E13 Location (text only)
            </h4>
            <p className="text-xs text-ink/55">
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
    <div className="site-surface p-6">
      <h3 className="mb-3 text-xl font-semibold text-ink">Temporal Model</h3>
      <p className="mb-4 text-sm leading-relaxed text-ink/65">
        Time is modeled through E52 Time-Span linked to observations and
        lifecycle events. Each mapped feature can carry source-presence, status,
        function, modification, destruction, production, or transformation
        events, so a point address, line road, or polygon plantation can all
        change through time without losing their shared E53 location basis.
      </p>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink/75">
            Observation Time
          </h4>
          <div className="bg-background p-4 font-mono text-xs text-ink/65 space-y-1.5">
            <div>
              <span style={{ color: CRM_COLORS['E13'] }}>
                E13 Attr. Assign.
              </span>
              {' -> P4 has time-span -> '}
              <span style={{ color: CRM_COLORS['E52'] }}>E52</span>
            </div>
            <div className="ml-4">
              <span style={{ color: CRM_COLORS['E52'] }}>E52</span>
              {' -> P82 at some time within -> xsd:gYear'}
            </div>
            <div className="mt-3 text-ink/55">Almanac coverage: ~1750-1863</div>
            <div className="text-ink/55">
              Each E13 records one year of observation
            </div>
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink/75">
            Name Dating
          </h4>
          <div className="bg-background p-4 font-mono text-xs text-ink/65 space-y-1.5">
            <div>
              <span style={{ color: CRM_COLORS['E22'] }}>E22 Source</span>
              {' -> P108i was produced by -> E12 -> P4 has time-span -> E52'}
            </div>
            <div className="mt-1 text-ink/55">
              The production date of the source provides temporal scope for the
              E41 names it carries.
            </div>
            <div className="mt-3 font-sans text-ink/55">
              Map sources: 1930 (primary, QGIS polygons), 1860-79 (historical
              name labels)
            </div>
          </div>
          <div className="mt-3">
            <h4 className="mb-2 text-sm font-semibold text-ink/75">
              Plantation Mergers (E81)
            </h4>
            <p className="text-xs text-ink/55">
              When plantations merge, <strong>E81 Transformation</strong>{' '}
              simultaneously ends old E25 entities (P124 transformed) and
              produces the merged E25 (P123 resulted in). For example,
              Suzanna&apos;sdal and Geijersvlijt merging into one plantation.
            </p>
          </div>
          <div className="mt-3">
            <h4 className="mb-2 text-sm font-semibold text-ink/75">
              Organization Absorption (E68)
            </h4>
            <p className="text-xs text-ink/55">
              When one organization absorbs another,{' '}
              <strong>E68 Dissolution</strong> (P99 dissolved) ends the old E74.
              The absorbing E74 acts as agent via P14 carried out by.
            </p>
          </div>
          <div className="mt-3">
            <h4 className="mb-2 text-sm font-semibold text-ink/75">
              Feature Lifecycle
            </h4>
            <p className="text-xs text-ink/55">
              Source presence and status/function changes are recorded as{' '}
              <strong>E17 Type Assignment</strong>. Physical changes to an
              existing feature use <strong>E11 Modification</strong>;
              destruction uses <strong>E6 Destruction</strong>; reconstruction
              or a newly erected building uses a new E25 feature with an{' '}
              <strong>E12 Production</strong> event. This lets a Paramaribo
              address point keep its E53 location while buildings, layouts,
              names, and uses change over time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProvenanceBoundarySection() {
  return (
    <div className="site-surface p-6">
      <h3 className="mb-3 text-xl font-semibold text-ink">
        Provenance Boundary
      </h3>
      <p className="mb-4 text-sm leading-relaxed text-ink/65">
        Provenance starts at different levels depending on what is being
        modeled. Entity-level provenance tracks how a current record was
        derived, while assertion-level provenance tracks where each mutable
        value comes from.
      </p>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink/75">
            Entity-level provenance
          </h4>
          <div className="bg-background p-4 font-mono text-xs text-ink/65 space-y-1.5">
            <div>
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-bold mr-0.5"
                style={{
                  backgroundColor: CRM_COLORS['E25'],
                  color: '#0f172a',
                  borderRadius: '0px',
                }}
              >
                E25
              </span>
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-bold mr-0.5"
                style={{
                  backgroundColor: CRM_COLORS['E26'],
                  color: '#0f172a',
                  borderRadius: '0px',
                }}
              >
                E26
              </span>
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-bold mr-0.5"
                style={{
                  backgroundColor: CRM_COLORS['E53'],
                  color: '#0f172a',
                  borderRadius: '0px',
                }}
              >
                E53
              </span>
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-bold mr-0.5"
                style={{
                  backgroundColor: CRM_COLORS['E74'],
                  color: '#0f172a',
                  borderRadius: '0px',
                }}
              >
                E74
              </span>
              {' -> prov:wasDerivedFrom -> PROV record'}
            </div>
            <div className="text-ink/55">
              Use for record lineage and transformation audit.
            </div>
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink/75">
            Assertion-level provenance
          </h4>
          <div className="bg-background p-4 font-mono text-xs text-ink/65 space-y-1.5">
            <div>
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-bold mr-0.5"
                style={{
                  backgroundColor: CRM_COLORS['E41'],
                  color: '#0f172a',
                  borderRadius: '0px',
                }}
              >
                E41
              </span>
              {' name -> P128i -> '}
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-bold mr-0.5"
                style={{
                  backgroundColor: CRM_COLORS['E22'],
                  color: '#0f172a',
                  borderRadius: '0px',
                }}
              >
                E22
              </span>
              {' source (+ source year/time)'}
            </div>
            <div>
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-bold mr-0.5"
                style={{
                  backgroundColor: CRM_COLORS['E13'],
                  color: '#0f172a',
                  borderRadius: '0px',
                }}
              >
                E13
              </span>
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-bold mr-0.5"
                style={{
                  backgroundColor: CRM_COLORS['E17'],
                  color: '#0f172a',
                  borderRadius: '0px',
                }}
              >
                E17
              </span>
              {' assertion -> prov:hadPrimarySource -> '}
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-bold mr-0.5"
                style={{
                  backgroundColor: CRM_COLORS['E22'],
                  color: '#0f172a',
                  borderRadius: '0px',
                }}
              >
                E22
              </span>
              {' source + P4 -> E52'}
            </div>
            <div>
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-bold mr-0.5"
                style={{
                  backgroundColor: CRM_COLORS['E53'],
                  color: '#0f172a',
                  borderRadius: '0px',
                }}
              >
                E53
              </span>
              {' location -> P70i is documented in -> '}
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-bold mr-0.5"
                style={{
                  backgroundColor: CRM_COLORS['E22'],
                  color: '#0f172a',
                  borderRadius: '0px',
                }}
              >
                E22
              </span>
              {' source'}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 site-surface site-surface-background p-3 text-xs text-ink/65">
        <p>
          Source references are authoritative only when they resolve to
          registered E22 entries in{' '}
          <span className="font-mono">data/sources-registry.jsonld</span> and
          are visible on the Sources page.
        </p>
      </div>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────────── */
export default function ModelPage() {
  return (
    <Suspense>
      <ModelPageInner />
    </Suspense>
  );
}

function ModelPageInner() {
  const searchParams = useSearchParams();
  const [counts, setCounts] = useState<EntityCounts | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>('e25');
  const [hoveredRelation, setHoveredRelation] = useState<number | null>(null);
  const initializedFromUrl = useRef(false);

  useEffect(() => {
    fetchCounts().then(setCounts);
  }, []);

  // Initialize from ?entity= param (once, after mount)
  useEffect(() => {
    if (initializedFromUrl.current) return;
    initializedFromUrl.current = true;
    const entityParam = searchParams.get('entity');
    if (entityParam) {
      // Accept both "E25" and "e25" formats
      const id = entityParam.toLowerCase();
      if (ENTITIES.some((e) => e.id === id)) {
        setSelectedEntity(id);
      }
    }
  }, [searchParams]);

  const handleSelectEntity = useCallback((id: string) => {
    setSelectedEntity(id);
    const entity = ENTITIES.find((e) => e.id === id);
    if (entity) {
      const params = new URLSearchParams(window.location.search);
      params.set('entity', entity.type);
      window.history.replaceState(null, '', `/model?${params.toString()}`);
    }
  }, []);

  const selectedDef = useMemo(
    () => ENTITIES.find((e) => e.id === selectedEntity) || null,
    [selectedEntity],
  );

  if (!counts) {
    return (
      <div className="h-full flex items-center justify-center px-4">
        <section
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="w-full max-w-4xl site-panel p-5"
        >
          <div className="site-kicker mb-4">Loading data model</div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="h-16 animate-pulse bg-ink/5" />
            <div className="h-16 animate-pulse bg-ink/5" />
            <div className="h-16 animate-pulse bg-ink/5" />
            <div className="h-16 animate-pulse bg-ink/5" />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
        {/* Header */}
        <div className="mb-10">
          <div className="site-kicker mb-3">CIDOC-CRM Mapping</div>
          <h1 className="mb-3 text-3xl font-semibold text-ink sm:text-4xl">
            Data Model
          </h1>
          <p className="max-w-3xl leading-relaxed text-ink/70">
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
            onSelect={handleSelectEntity}
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

        <div className="mb-10">
          <ProvenanceBoundarySection />
        </div>

        {/* All entities quick reference */}
        <div className="mb-10">
          <h2 className="mb-2 text-2xl font-semibold text-ink">
            All Entity Types
          </h2>
          <p className="mb-4 text-sm text-ink/65">
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
                    handleSelectEntity(ent.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`site-panel p-4 text-left transition-all hover:ring-1 hover:ring-teal-strong/20 ${
                    selectedEntity === ent.id
                      ? 'border-teal-strong ring-1 ring-teal-strong/30'
                      : ''
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
                      <span className="text-sm font-semibold text-ink">
                        {ent.label}
                      </span>
                      {count !== null ? (
                        <span className="ml-2 text-xs text-ink/45">
                          {count.toLocaleString()}
                        </span>
                      ) : (
                        <span className="ml-2 text-xs italic text-ink/45">
                          structural
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="line-clamp-2 text-xs text-ink/60">{ent.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Research Questions */}
        <div className="mb-10 site-surface p-6">
          <h3 className="mb-2 text-xl font-semibold text-ink">
            Research Questions
          </h3>
          <p className="mb-4 text-sm text-ink/65">
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
                      ? 'bg-teal-strong'
                      : q.status === 'amber'
                        ? 'bg-entity-e12'
                        : 'bg-entity-e17'
                  }`}
                />
                <div className="min-w-0">
                  <p className="font-medium text-ink/80">{q.question}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink/45">
                    {q.path}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-4 text-[11px] text-ink/50">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 bg-teal-strong" />{' '}
              Answerable now
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 bg-entity-e12" /> Needs
              entity resolution
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 bg-entity-e17" /> Needs new
              data sources
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
