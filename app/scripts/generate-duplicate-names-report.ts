import fs from 'fs';
import path from 'path';

interface Place {
  id: string;
  type: string;
  names: Array<{
    text: string;
    language?: string;
    type?: string;
    isPreferred?: boolean;
  }>;
  locationDescription?: string;
  locationDescriptionOriginal?: string;
  district?: string;
}

interface PlantationDuplicate {
  name: string;
  count: number;
  plantations: Array<{
    id: string;
    locationDescription?: string;
    district?: string;
  }>;
}

const DATA_DIR = path.join(__dirname, '../../data');
const LOD_DIR = path.join(__dirname, '../lod');

function normalizeText(value?: string): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getLocationKey(locationDescription?: string, district?: string): string {
  const loc = normalizeText(locationDescription);
  const dist = normalizeText(district);
  if (!loc && !dist) {
    return '';
  }
  return `${loc}||${dist}`;
}

function hasDifferentKnownLocations(
  entries: Array<{ locationDescription?: string; district?: string }>
): boolean {
  const locationKeys = new Set<string>();
  for (const entry of entries) {
    const key = getLocationKey(entry.locationDescription, entry.district);
    if (key) {
      locationKeys.add(key);
    }
  }
  return locationKeys.size >= 2;
}

async function generateDuplicateReport() {
  // Read gazetteer
  const gazeteerPath = path.join(DATA_DIR, 'places-gazetteer.json');
  const gazeteerData = JSON.parse(fs.readFileSync(gazeteerPath, 'utf-8'));

  // Filter for plantages only
  const plantages: Place[] = gazeteerData.filter(
    (place: Place) => place.type === 'plantation'
  );

  console.log(`Total plantages in gazetteer: ${plantages.length}`);

  // Group by preferred name
  const nameMap = new Map<string, Place[]>();

  for (const plantation of plantages) {
    const preferredName = plantation.names?.find(
      (n) => n.isPreferred === true
    )?.text;

    if (preferredName) {
      if (!nameMap.has(preferredName)) {
        nameMap.set(preferredName, []);
      }
      nameMap.get(preferredName)!.push(plantation);
    }
  }

  // Find exact duplicates
  const exactDuplicates: PlantationDuplicate[] = [];

  for (const [name, places] of nameMap.entries()) {
    if (places.length <= 1) {
      continue;
    }

    const plantations = places.map((p) => ({
      id: p.id,
      locationDescription: p.locationDescription,
      district: p.district,
    }));

    if (!hasDifferentKnownLocations(plantations)) {
      continue;
    }

    const duplicate: PlantationDuplicate = {
      name,
      count: plantations.length,
      plantations,
    };
    exactDuplicates.push(duplicate);
  }

  // Sort by count (descending)
  exactDuplicates.sort((a, b) => b.count - a.count);

  // Write JSON report
  const reportPath = path.join(LOD_DIR, 'duplicate-names.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(exactDuplicates, null, 2));

  // Write CSV report
  const csvPath = path.join(LOD_DIR, 'duplicate-names.csv');
  let csvContent =
    'plantationName,count,stmId,locationDescription,district\n';

  for (const dup of exactDuplicates) {
    for (const plant of dup.plantations) {
      const locDesc = plant.locationDescription
        ? plant.locationDescription.replace(/"/g, '""')
        : '';
      const dist = plant.district || '';
      csvContent += `"${dup.name}",${dup.count},${plant.id},"${locDesc}","${dist}"\n`;
    }
  }

  fs.writeFileSync(csvPath, csvContent);

  // Print summary
  console.log(`\n===== EXACT DUPLICATES REPORT =====\n`);
  console.log('Manual baseline: only groups with different known locations are included.');
  console.log(`Total plantages with duplicate names: ${exactDuplicates.length}`);
  console.log(`Total duplicate entries: ${exactDuplicates.reduce((sum, d) => sum + d.count, 0)}`);
  console.log('\nTop 20 most duplicated names:');
  console.log('================================');

  for (let i = 0; i < Math.min(20, exactDuplicates.length); i++) {
    const dup = exactDuplicates[i];
    console.log(`\n${i + 1}. "${dup.name}" (${dup.count} entries)`);
    for (const plant of dup.plantations) {
      const location = plant.locationDescription
        ? ` - ${plant.locationDescription}`
        : '';
      const districtInfo = plant.district ? ` [${plant.district}]` : '';
      console.log(`   ${plant.id}${location}${districtInfo}`);
    }
  }

  console.log(`\n✓ Reports saved to:`);
  console.log(`  - ${reportPath} (JSON)`);
  console.log(`  - ${csvPath} (CSV)`);
}

generateDuplicateReport().catch(console.error);
