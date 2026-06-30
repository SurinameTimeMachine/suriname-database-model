/**
 * Transform Almanakken CSV into CIDOC-CRM observation + appellation entities.
 *
 * Produces in-memory:
 *   OrganizationObservation entities, E41 Appellations, E22 almanac sources
 */
import { almanakkenField, isVerlaten, readAlmanakkenRows } from './almanakken';

const STM = 'https://data.surinametijdmachine.org/';
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
  sranantongo_name: string;
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
  split2_id: string;
  split2_lab: string;
  split3_id: string;
  split3_lab: string;
  split4_id: string;
  split4_lab: string;
  partof_id: string;
  partof_lab: string;
  reference_std_id: string;
  free_residents: string;
  owned_by_id: string;
  owned_by_id2: string;
  enslaved_shared_with: string;
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
  const { path, version, rows } = readAlmanakkenRows();
  console.log(`Loaded ${rows.length} almanac observations from ${path}`);
  console.log(`  CSV version: ${version}`);

  const observations: ObservationRow[] = [];
  const appellations: AppellationRow[] = [];
  const almanacYears = new Set<string>();
  const seenAppKeys = new Set<string>();

  let unlinkedCount = 0;

  for (const row of rows) {
    const recordId = almanakkenField(row, 'recordid');
    const year = almanakkenField(row, 'year');
    const plantationId = almanakkenField(row, 'plantation_id');
    const plantationOrg = almanakkenField(row, 'plantation_org');
    const plantationStd = almanakkenField(row, 'plantation_std');
    const sranantongoName = almanakkenField(row, 'sranantongo_naam');
    const psurId = almanakkenField(row, 'psur_id');

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
      sranantongo_name: sranantongoName,
      owner: almanakkenField(row, 'eigenaren'),
      administrator: almanakkenField(row, 'administrateurs'),
      director: almanakkenField(row, 'directeuren'),
      product: almanakkenField(row, 'product_std'),
      enslaved_count: safeInt(row.slaven),
      is_deserted: isVerlaten(row.deserted) ? '1' : '',
      location_std: almanakkenField(row, 'loc_std'),
      location_org: almanakkenField(row, 'loc_org'),
      size_akkers: safeInt(row.size_std),
      page_reference: almanakkenField(row, 'page'),
      psur_id: psurId,
      source_uri: sourceUri,
      split1_id: almanakkenField(row, 'has_parts1_id', 'split1_id'),
      split1_lab: almanakkenField(row, 'has_parts1_lab', 'split1_lab'),
      split2_id: almanakkenField(row, 'has_parts2_id', 'split2_id'),
      split2_lab: almanakkenField(row, 'has_parts2_lab', 'split2_lab'),
      split3_id: almanakkenField(row, 'has_parts3_id', 'split3_id'),
      split3_lab: almanakkenField(row, 'has_parts3_lab', 'split3_lab'),
      split4_id: almanakkenField(row, 'has_parts4_id', 'split4_id'),
      split4_lab: almanakkenField(row, 'has_parts4_lab', 'split4_lab'),
      partof_id: almanakkenField(row, 'part_of_id', 'partof_id'),
      partof_lab: almanakkenField(row, 'part_of_lab', 'partof_lab'),
      reference_std_id: almanakkenField(row, 'reference_org', 'reference_std_id'),
      free_residents: safeInt(row.vrije_bewoners ?? row.free_residents),
      owned_by_id: almanakkenField(row, 'owned_by_id'),
      owned_by_id2: almanakkenField(row, 'owned_by_id2'),
      enslaved_shared_with: almanakkenField(row, 'enslaved_shared_with'),
      admin_in_europe: almanakkenField(row, 'administrateurs_in_Europa'),
      admin_in_suriname: almanakkenField(row, 'administrateurs_in_suriname'),
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
