import { parse } from 'csv-parse/sync';
/**
 * Transform QGIS plantation polygon CSV into CIDOC-CRM entity arrays.
 *
 * Reads: data/07-gis-plantation-map-1930/plantation_polygons_1930.csv
 * CRS: EPSG:31170 (Suriname Old TM / Zanderij datum) -> EPSG:4326 (WGS84) via proj4
 *
 * Produces in-memory entity arrays (no intermediate CSVs):
 *   E25 plantations (human-made features), E74 organizations, E53 places,
 *   E41 appellations, E22 sources, plantation-map links
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import proj4 from 'proj4';

// Register Suriname Old TM (Zanderij datum) - EPSG:31170
// Includes towgs84 datum shift for proper WGS84 alignment.
proj4.defs(
  'EPSG:31170',
  '+proj=tmerc +lat_0=0 +lon_0=-55.68333333333 +k=0.9996 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-265,120,-358,0,0,0,0 +units=m +no_defs',
);

const BASE_DIR = join(__dirname, '../..');
const GIS_CSV = join(
  BASE_DIR,
  'data/07-gis-plantation-map-1930/plantation_polygons_1930.csv',
);

const STM = 'https://suriname-timemachine.org/ontology/';
const WD = 'http://www.wikidata.org/entity/';

// --- Types ---

export interface E25Row {
  uri: string;
  slug: string;
  fid: string;
  prefLabel: string;
  status: string;
  featureType: string;
  p52_owner_qid: string;
  p51_former_owner_qid: string;
  p53_place_uri: string;
}

export interface E74Row {
  qid: string;
  uri: string;
  prefLabel: string;
  psur_id: string;
  psur_id2: string;
  psur_id3: string;
  absorbed_into_qid: string;
}

export interface E53Row {
  uri: string;
  fid: string;
  map_year: string;
  observed_label: string;
  coords_wgs84: string;
  coords_utm: string;
  source_uri: string;
  plantation_uri: string;
}

export interface E41Row {
  uri: string;
  symbolic_content: string;
  language: string;
  carried_by: string;
  identifies_uri: string;
  identifies_type: string;
  source_year: string;
  alt_form_of?: string;
}

export interface MapLink {
  plantation_uri: string;
  map_uri: string;
  map_id: string;
  label_on_map: string;
  has_polygon: string;
  qid: string;
}

export interface SourceRow {
  uri: string;
  id: string;
  label: string;
  type: string;
  year: string;
  source_url: string;
  maker: string;
  publisher: string;
  publication_place: string;
  holding_archive: string;
  handle_url: string;
  iiif_manifest: string;
  iiif_info_url: string;
}

export interface PlantationTransformResult {
  e25: E25Row[];
  e74: E74Row[];
  e53: E53Row[];
  e41: E41Row[];
  mapLinks: MapLink[];
  sources: SourceRow[];
}

// --- Helpers ---

function slugify(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function reprojectWkt(wktUtm: string): string {
  if (!wktUtm) return wktUtm;
  return wktUtm.replace(/\(([^()]+)\)/g, (_match, coordText: string) => {
    const pairs = coordText.split(',');
    const newPairs = pairs.map((pair) => {
      const parts = pair.trim().split(/\s+/);
      if (parts.length >= 2) {
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        if (!isNaN(x) && !isNaN(y)) {
          const [lon, lat] = proj4('EPSG:31170', 'EPSG:4326', [x, y]);
          return `${lon.toFixed(8)} ${lat.toFixed(8)}`;
        }
      }
      return pair.trim();
    });
    return '(' + newPairs.join(', ') + ')';
  });
}

// --- Main ---

export function transformPlantations(): PlantationTransformResult {
  const csv = readFileSync(GIS_CSV, 'utf-8');
  const rows: Record<string, string>[] = parse(csv, {
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
  });
  console.log(
    `Loaded ${rows.length} polygons from plantation_polygons_1930.csv`,
  );

  const e25: E25Row[] = [];
  const e74: E74Row[] = [];
  const e53: E53Row[] = [];
  const e41: E41Row[] = [];
  const mapLinks: MapLink[] = [];
  const seenQids = new Set<string>();
  const seenSlugs = new Set<string>();

  for (const p of rows) {
    const fid = (p.fid ?? '').trim();
    const qid = (p.qid ?? '').trim();
    const qidAlt = (p.qid_alt ?? '').trim();
    const label = (p.plantation_label ?? '').trim();
    const label1930 = (p.label_1930 ?? '').trim();
    const label1860 = (p['label_1860-79'] ?? '').trim();
    const coordsUtm = (p.coords ?? '').trim();
    const psurId = (p.psur_id ?? '').trim();
    const psurId2 = (p.psur_id2 ?? '').trim();
    const psurId3 = (p.psur_id3 ?? '').trim();

    let slug = label ? slugify(label) : `fid-${fid}`;
    if (seenSlugs.has(slug)) {
      slug = `${slug}-fid-${fid}`;
    }
    seenSlugs.add(slug);
    const hasQid = !!qid;
    const hasPsur = !!psurId;
    const hasLabel = !!label;
    const status = !hasQid && !hasPsur && !hasLabel ? 'unknown' : 'built';

    const plantationUri = `${STM}plantation/${slug}`;

    // E25 Human-Made Feature (plantation)
    e25.push({
      uri: plantationUri,
      slug,
      fid,
      prefLabel: label,
      status,
      featureType: 'plantation',
      p52_owner_qid: qid,
      p51_former_owner_qid: qidAlt,
      p53_place_uri: coordsUtm ? `${STM}place/1930/fid-${fid}` : '',
    });

    // E74 Organization (deduplicated by Q-ID)
    if (qid && !seenQids.has(qid)) {
      seenQids.add(qid);
      e74.push({
        qid,
        uri: `${WD}${qid}`,
        prefLabel: label,
        psur_id: psurId,
        psur_id2: psurId2,
        psur_id3: psurId3,
        absorbed_into_qid: qidAlt,
      });
    }
    if (qidAlt && !seenQids.has(qidAlt)) {
      seenQids.add(qidAlt);
      e74.push({
        qid: qidAlt,
        uri: `${WD}${qidAlt}`,
        prefLabel: '',
        psur_id: '',
        psur_id2: '',
        psur_id3: '',
        absorbed_into_qid: '',
      });
    }

    // E53 Place
    if (coordsUtm) {
      const coordsWgs84 = reprojectWkt(coordsUtm);
      e53.push({
        uri: `${STM}place/1930/fid-${fid}`,
        fid,
        map_year: '1930',
        observed_label: label1930 || label,
        coords_wgs84: coordsWgs84,
        coords_utm: coordsUtm,
        source_uri: `${STM}source/map-1930`,
        plantation_uri: plantationUri,
      });
    }

    // E41 Appellations
    let e41_1930_uri = '';
    if (label1930) {
      e41_1930_uri = `${STM}appellation/${slugify(label1930)}-map1930`;
      e41.push({
        uri: e41_1930_uri,
        symbolic_content: label1930,
        language: 'nl',
        carried_by: `${STM}source/map-1930`,
        identifies_uri: plantationUri,
        identifies_type: 'E25',
        source_year: '1930',
      });
    }

    if (label1860) {
      const e41_1860_uri = `${STM}appellation/${slugify(label1860)}-map1860`;
      e41.push({
        uri: e41_1860_uri,
        symbolic_content: label1860,
        language: 'nl',
        carried_by: `${STM}source/map-1860-79`,
        identifies_uri: plantationUri,
        identifies_type: 'E25',
        source_year: '1870',
        alt_form_of: e41_1930_uri,
      });
    }

    if (label && label !== label1930 && label !== label1860) {
      e41.push({
        uri: `${STM}appellation/${slugify(label)}-canonical`,
        symbolic_content: label,
        language: 'nl',
        carried_by: '',
        identifies_uri: plantationUri,
        identifies_type: 'E25',
        source_year: '',
        alt_form_of: e41_1930_uri,
      });
    }

    // Map depiction links
    if (label1930) {
      mapLinks.push({
        plantation_uri: plantationUri,
        map_uri: `${STM}source/map-1930`,
        map_id: 'MAP_1930',
        label_on_map: label1930,
        has_polygon: 'true',
        qid,
      });
    }
    if (label1860) {
      mapLinks.push({
        plantation_uri: plantationUri,
        map_uri: `${STM}source/map-1860-79`,
        map_id: 'MAP_1860-79',
        label_on_map: label1860,
        has_polygon: 'false',
        qid,
      });
    }
  }

  // Static E22 sources for the two maps (metadata from 10-historic-maps-metadata.tsv)
  const sources: SourceRow[] = [
    {
      uri: `${STM}source/map-1930`,
      id: 'MAP_1930',
      label: 'Kaart van Suriname (1930)',
      type: 'map',
      year: '1930',
      source_url: '',
      maker:
        'Louis August Bakhuis, W. de Quant, Johan François Adriaan Cateau van Rosevelt, Jan Felix Adriaan Eugeen van Lansberge, Ministerie van Koloniën (Den Haag)',
      publisher: 'Departement van Koloniën',
      publication_place: 'Den Haag',
      holding_archive: 'UB Leiden',
      handle_url: 'http://hdl.handle.net/1887.1/item:2015734',
      iiif_manifest: 'http://hdl.handle.net/1887.1/item:2015734',
      iiif_info_url: '',
    },
    {
      uri: `${STM}source/map-1860-79`,
      id: 'MAP_1860-79',
      label: 'Kaart van Suriname (1860-1879)',
      type: 'map',
      year: '1870',
      source_url: '',
      maker:
        'Johan François Adriaan Cateau van Rosevelt, Jan Felix Adriaan Eugeen van Lansberge',
      publisher: '',
      publication_place: '',
      holding_archive: 'UB Leiden',
      handle_url: 'http://hdl.handle.net/1887.1/item:2016077',
      iiif_manifest:
        'https://digitalcollections.universiteitleiden.nl/iiif_manifest/item%3A2017249/manifest',
      iiif_info_url:
        'https://digitalcollections.universiteitleiden.nl/iiif/2/item%3A2016077%7EJP2%7E35b1a5e9d45727b8dcb9652f727764f66275fd83c4b3e9df67295745c321aa4d%7Edigitalc/info.json',
    },
  ];

  console.log(`  E25 Plantations:  ${e25.length}`);
  console.log(`  E74 Organizations: ${e74.length}`);
  console.log(`  E53 Places:       ${e53.length}`);
  console.log(`  E41 Appellations: ${e41.length}`);
  console.log(`  Map depictions:   ${mapLinks.length}`);
  console.log(`  E22 Sources:      ${sources.length}`);

  // CRS sanity check
  if (e53.length > 0) {
    const sample = e53[0].coords_wgs84;
    const m = sample.match(/([-\d.]+)\s+([-\d.]+)/);
    if (m) {
      const lon = parseFloat(m[1]);
      const lat = parseFloat(m[2]);
      const ok = lon > -58 && lon < -53 && lat > 1 && lat < 7;
      console.log(
        `  CRS check: lon=${lon.toFixed(4)}, lat=${lat.toFixed(4)} -> ${ok ? 'OK' : 'OUTSIDE Suriname'}`,
      );
    }
  }

  return { e25, e74, e53, e41, mapLinks, sources };
}

// Run standalone
if (require.main === module) {
  console.log('=== Plantation Data Transformation ===\n');
  transformPlantations();
  console.log('\n=== Done ===');
}
