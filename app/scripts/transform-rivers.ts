import { parse } from 'csv-parse/sync';
/**
 * Transform QGIS rivers CSV into CIDOC-CRM entity arrays.
 *
 * Reads: data/07-gis-plantation-map-1930/rivers.csv
 * CRS: EPSG:31170 (Suriname Old TM / Zanderij datum) -> EPSG:4326 (WGS84) via proj4
 *
 * Produces in-memory entity arrays (no intermediate CSVs):
 *   E26 physical features (rivers/creeks), E53 places (LineString geometry),
 *   E41 appellations
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import proj4 from 'proj4';

// Register Suriname Old TM (Zanderij datum) - EPSG:31170
proj4.defs(
  'EPSG:31170',
  '+proj=tmerc +lat_0=0 +lon_0=-55.68333333333 +k=0.9996 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-265,120,-358,0,0,0,0 +units=m +no_defs',
);

const BASE_DIR = join(__dirname, '../..');
const RIVERS_CSV = join(BASE_DIR, 'data/07-gis-plantation-map-1930/rivers.csv');

const STM = 'https://suriname-timemachine.org/ontology/';
const VOCAB_BASE =
  'https://data.suriname-timemachine.org/vocabulary/geographical-feature/natural';

// --- Types ---

export interface E26Row {
  uri: string;
  slug: string;
  fid: string;
  prefLabel: string;
  featureType: 'river' | 'creek';
  mainBodyWater: string;
  p53_place_uri: string;
}

export interface E26E53Row {
  uri: string;
  fid: string;
  map_year: string;
  observed_label: string;
  coords_wgs84: string;
  coords_utm: string;
  source_uri: string;
  feature_uri: string;
  geometry_type: 'LineString';
}

export interface E26E41Row {
  uri: string;
  symbolic_content: string;
  language: string;
  carried_by: string;
  identifies_uri: string;
  identifies_type: string;
  source_year: string;
  alt_form_of?: string;
}

export interface RiverTransformResult {
  e26: E26Row[];
  e53: E26E53Row[];
  e41: E26E41Row[];
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

function reprojectLineString(wkt: string): string {
  if (!wkt) return wkt;
  // Match coordinates inside LineString(...)
  return wkt.replace(/\(([^()]+)\)/g, (_match, coordText: string) => {
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

/** Determine if a river segment is a creek based on its label */
function classifyFeature(
  label1930: string,
  label1882: string,
  altLabel: string,
): 'river' | 'creek' {
  const combined = `${label1930} ${label1882} ${altLabel}`.toLowerCase();
  if (combined.includes('kreek')) return 'creek';
  return 'river';
}

// --- Main ---

export function transformRivers(): RiverTransformResult {
  const csv = readFileSync(RIVERS_CSV, 'utf-8');
  const rows: Record<string, string>[] = parse(csv, {
    columns: true,
    delimiter: ',',
    skip_empty_lines: true,
  });
  console.log(`Loaded ${rows.length} river segments from rivers.csv`);

  const e26: E26Row[] = [];
  const e53: E26E53Row[] = [];
  const e41: E26E41Row[] = [];
  const seenSlugs = new Set<string>();

  for (const r of rows) {
    const fid = (r.fid ?? '').trim();
    const label1930 = (r.label1930 ?? '').trim();
    const mainBodyWater = (r.main_body_water ?? '').trim();
    const label1882 = (r.label1882 ?? '').trim();
    const altLabel = (r.alt_label ?? '').trim();
    const wktGeometry = (r.wkt_geometry ?? '').trim();

    // Determine the best label
    const prefLabel =
      label1930 ||
      label1882 ||
      altLabel ||
      (mainBodyWater
        ? `${mainBodyWater} (segment ${fid})`
        : `River segment ${fid}`);
    const featureType = classifyFeature(label1930, label1882, altLabel);

    let slug = label1930
      ? slugify(label1930)
      : label1882
        ? slugify(label1882)
        : `fid-${fid}`;
    if (seenSlugs.has(slug)) {
      slug = `${slug}-fid-${fid}`;
    }
    seenSlugs.add(slug);

    const featureUri = `${STM}feature/river/${slug}`;

    // E26 Physical Feature
    e26.push({
      uri: featureUri,
      slug,
      fid,
      prefLabel,
      featureType,
      mainBodyWater,
      p53_place_uri: wktGeometry ? `${STM}place/1930/river-fid-${fid}` : '',
    });

    // E53 Place (LineString geometry)
    if (wktGeometry) {
      const coordsWgs84 = reprojectLineString(wktGeometry);
      e53.push({
        uri: `${STM}place/1930/river-fid-${fid}`,
        fid,
        map_year: '1930',
        observed_label: prefLabel,
        coords_wgs84: coordsWgs84,
        coords_utm: wktGeometry,
        source_uri: `${STM}source/map-1930`,
        feature_uri: featureUri,
        geometry_type: 'LineString',
      });
    }

    // E41 Appellations
    let e41_1930_uri = '';
    if (label1930) {
      e41_1930_uri = `${STM}appellation/${slugify(label1930)}-river-map1930`;
      e41.push({
        uri: e41_1930_uri,
        symbolic_content: label1930,
        language: 'nl',
        carried_by: `${STM}source/map-1930`,
        identifies_uri: featureUri,
        identifies_type: 'E26',
        source_year: '1930',
      });
    }

    if (label1882) {
      const e41_1882_uri = `${STM}appellation/${slugify(label1882)}-river-map1882`;
      e41.push({
        uri: e41_1882_uri,
        symbolic_content: label1882,
        language: 'nl',
        carried_by: `${STM}source/map-1860-79`,
        identifies_uri: featureUri,
        identifies_type: 'E26',
        source_year: '1882',
        alt_form_of: e41_1930_uri || undefined,
      });
    }

    if (altLabel && altLabel !== label1930 && altLabel !== label1882) {
      e41.push({
        uri: `${STM}appellation/${slugify(altLabel)}-river-alt`,
        symbolic_content: altLabel,
        language: 'nl',
        carried_by: '',
        identifies_uri: featureUri,
        identifies_type: 'E26',
        source_year: '',
        alt_form_of: e41_1930_uri || undefined,
      });
    }
  }

  console.log(`  E26 Rivers/Creeks: ${e26.length}`);
  console.log(`  E53 Places:        ${e53.length}`);
  console.log(`  E41 Appellations:  ${e41.length}`);

  const rivers = e26.filter((e) => e.featureType === 'river').length;
  const creeks = e26.filter((e) => e.featureType === 'creek').length;
  console.log(`  -> Rivers: ${rivers}, Creeks: ${creeks}`);

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

  return { e26, e53, e41 };
}

// Run standalone
if (require.main === module) {
  console.log('=== River Data Transformation ===\n');
  transformRivers();
  console.log('\n=== Done ===');
}
