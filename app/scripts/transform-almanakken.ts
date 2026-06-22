import { parse } from 'csv-parse/sync';
/**
 * Transform Almanakken CSV into CIDOC-CRM observation + appellation entities.
 *
 * Reads: data/06-almanakken/.../Plantations Surinaamse Almanakken v1.0.csv
 * Encoding: latin-1 (ISO 8859-1)
 *
 * Produces in-memory:
 *   OrganizationObservation entities, E41 Appellations, E22 almanac sources
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const BASE_DIR = join(__dirname, '../..');
const ALMANAC_CSV = join(
  BASE_DIR,
  'data/06-almanakken - Plantations Surinaamse Almanakken/Plantations Surinaamse Almanakken v1.0.csv',
);

const STM = 'https://suriname-timemachine.org/ontology/';
const WD = 'http://www.wikidata.org/entity/';

// --- Types ---

export interface ObservationRow {
  uri: string;
  record_id: string;
  organization_qid: string;
  organization_uri: string;
  observation_year: string;
  observed_name: string;
  standardized_name: string;
  owner: string;
  administrator: string;
  director: string;
  product: string;
  enslaved_count: string;
  is_deserted: string;
  location_std: string;
  location_org: string;
  size_akkers: string;
  page_reference: string;
  psur_id: string;
  source_uri: string;
  split1_id: string;
  split1_lab: string;
  partof_id: string;
  partof_lab: string;
  reference_std_id: string;
  free_residents: string;
  admin_in_europe: string;
  admin_in_suriname: string;
}

export interface AppellationRow {
  uri: string;
  symbolic_content: string;
  language: string;
  carried_by: string;
  identifies_uri: string;
  identifies_type: string;
  source_year: string;
  alt_form_of: string;
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

export interface AlmanakkenTransformResult {
  observations: ObservationRow[];
  appellations: AppellationRow[];
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

function safeInt(val: string | undefined): string {
  if (!val || !val.trim()) return '';
  const n = parseFloat(val.trim());
  return isNaN(n) ? '' : String(Math.floor(n));
}

// --- Main ---

export function transformAlmanakken(): AlmanakkenTransformResult {
  // Read with latin-1 encoding
  const buf = readFileSync(ALMANAC_CSV);
  const csv = new TextDecoder('latin1').decode(buf);

  const rows: Record<string, string>[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  console.log(`Loaded ${rows.length} almanac observations`);

  const observations: ObservationRow[] = [];
  const appellations: AppellationRow[] = [];
  const almanacYears = new Set<string>();
  const seenAppKeys = new Set<string>();

  let unlinkedCount = 0;

  for (const row of rows) {
    const recordId = (row.recordid ?? '').trim();
    const year = (row.year ?? '').trim();
    const plantationId = (row.plantation_id ?? '').trim();
    const plantationOrg = (row.plantation_org ?? '').trim();
    const plantationStd = (row.plantation_std ?? '').trim();
    const psurId = (row.psur_id ?? '').trim();

    if (!recordId) continue;
    if (year) almanacYears.add(year);

    const obsUri = `${STM}obs/${recordId}`;
    const orgUri = plantationId ? `${WD}${plantationId}` : '';
    if (!plantationId) unlinkedCount++;

    const sourceUri = year ? `${STM}source/almanac-${year}` : '';

    observations.push({
      uri: obsUri,
      record_id: recordId,
      organization_qid: plantationId,
      organization_uri: orgUri,
      observation_year: year,
      observed_name: plantationOrg,
      standardized_name: plantationStd,
      owner: (row.eigenaren ?? '').trim(),
      administrator: (row.administrateurs ?? '').trim(),
      director: (row.directeuren ?? '').trim(),
      product: (row.product_std ?? '').trim(),
      enslaved_count: safeInt(row.slaven),
      is_deserted: (row.deserted ?? '').trim() ? '1' : '',
      location_std: (row.loc_std ?? '').trim(),
      location_org: (row.loc_org ?? '').trim(),
      size_akkers: safeInt(row.size_std),
      page_reference: (row.page ?? '').trim(),
      psur_id: psurId,
      source_uri: sourceUri,
      split1_id: (row.split1_id ?? '').trim(),
      split1_lab: (row.split1_lab ?? '').trim(),
      partof_id: (row['part of_id'] ?? '').trim(),
      partof_lab: (row.partof_lab ?? '').trim(),
      reference_std_id: (row.reference_std_id ?? '').trim(),
      free_residents: safeInt(row.vrije_bewoners),
      admin_in_europe: (row.administrateurs_in_Europa ?? '').trim(),
      admin_in_suriname: (row.administrateurs_in_suriname ?? '').trim(),
    });

    // E41 Appellations from almanac names
    if (plantationOrg && plantationId) {
      const appKey = `${plantationOrg}|${plantationId}|org`;
      if (!seenAppKeys.has(appKey)) {
        seenAppKeys.add(appKey);
        const appSlug = slugify(plantationOrg);
        const organizationSlug = slugify(plantationId);
        // Distinct source spellings can normalize to the same slug for one
        // organization. The source record ID keeps each E41 assertion stable.
        const recordSlug = slugify(recordId);
        const orgAppUri = `${STM}appellation/${appSlug}-${organizationSlug}-${recordSlug}-almanac-org`;
        let stdAppUri = '';

        // Standardized name variant
        if (plantationStd && plantationStd !== plantationOrg) {
          const stdKey = `${plantationStd}|${plantationId}|std`;
          if (!seenAppKeys.has(stdKey)) {
            seenAppKeys.add(stdKey);
            const stdSlug = slugify(plantationStd);
            stdAppUri = `${STM}appellation/${stdSlug}-${organizationSlug}-${recordSlug}-almanac-std`;
            appellations.push({
              uri: stdAppUri,
              symbolic_content: plantationStd,
              language: 'nl',
              carried_by: sourceUri,
              identifies_uri: orgUri,
              identifies_type: 'E74',
              source_year: year,
              alt_form_of: orgAppUri,
            });
          }
        }

        appellations.push({
          uri: orgAppUri,
          symbolic_content: plantationOrg,
          language: 'nl',
          carried_by: sourceUri,
          identifies_uri: orgUri,
          identifies_type: 'E74',
          source_year: year,
          alt_form_of: stdAppUri,
        });
      }
    }
  }

  // Generate E22 sources for each almanac year
  const sortedYears = [...almanacYears].sort();
  const sources: SourceRow[] = sortedYears.map((year) => ({
    uri: `${STM}source/almanac-${year}`,
    id: `ALMANAC_${year}`,
    label: `Surinaamsche Almanak (${year})`,
    type: 'almanac',
    year,
    source_url: '',
    maker: 'Koloniaal Bestuur van Suriname',
    publisher: 'Koloniaal Bestuur van Suriname',
    publication_place: 'Paramaribo',
    holding_archive: '',
    handle_url: '',
    iiif_manifest: '',
    iiif_info_url: '',
  }));

  console.log(`  Observations:     ${observations.length}`);
  console.log(
    `  Almanac years:    ${sortedYears.length} (${sortedYears[0]}-${sortedYears[sortedYears.length - 1]})`,
  );
  console.log(`  E41 Appellations: ${appellations.length}`);
  console.log(
    `  Unlinked (no Q-ID): ${unlinkedCount} (${((100 * unlinkedCount) / observations.length).toFixed(1)}%)`,
  );

  return { observations, appellations, sources };
}

// Run standalone
if (require.main === module) {
  console.log('=== Almanakken Data Transformation ===\n');
  transformAlmanakken();
  console.log('\n=== Done ===');
}
