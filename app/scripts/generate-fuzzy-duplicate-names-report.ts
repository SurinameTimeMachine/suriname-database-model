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

interface PlantationCluster {
  similarity: number;
  name1: string;
  name2: string;
  count: number;
  plantations: Array<{
    id: string;
    name: string;
    locationDescription?: string;
    district?: string;
  }>;
}

interface PlantationEntry {
  id: string;
  name: string;
  locationDescription?: string;
  district?: string;
}

interface ClusterEdge {
  similarity: number;
  name1: string;
  name2: string;
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

function escapeCsv(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function normalizeLocationDescription(value?: string): string {
  return (value || '').trim();
}

function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;
  const distances: number[][] = [];

  for (let i = 0; i <= aLen; i++) {
    distances[i] = [i];
  }
  for (let j = 0; j <= bLen; j++) {
    distances[0][j] = j;
  }

  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      if (a[i - 1] === b[j - 1]) {
        distances[i][j] = distances[i - 1][j - 1];
      } else {
        distances[i][j] = Math.min(
          distances[i - 1][j] + 1,
          distances[i][j - 1] + 1,
          distances[i - 1][j - 1] + 1
        );
      }
    }
  }

  return distances[aLen][bLen];
}

function levenshteinSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - distance / maxLength;
}

async function generateFuzzyDuplicateReport() {
  // Read gazetteer
  const gazeteerPath = path.join(DATA_DIR, 'places-gazetteer.json');
  const gazeteerData = JSON.parse(fs.readFileSync(gazeteerPath, 'utf-8'));

  // Filter for plantages only
  const plantages: Place[] = gazeteerData.filter(
    (place: Place) => place.type === 'plantation'
  );

  console.log(`Total plantages in gazetteer: ${plantages.length}`);

  // Extract all unique plantage names with their places
  const nameToPlaces = new Map<
    string,
    Array<{
      id: string;
      name: string;
      locationDescription?: string;
      district?: string;
    }>
  >();
  const idToKnownSpellings = new Map<string, string[]>();

  for (const plantation of plantages) {
    const knownSpellings = Array.from(
      new Set(
        (plantation.names || [])
          .map((n) => (n.text || '').trim())
          .filter((text) => text.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));

    if (knownSpellings.length > 0) {
      idToKnownSpellings.set(plantation.id, knownSpellings);
    }

    const preferredName = plantation.names?.find(
      (n) => n.isPreferred === true
    )?.text;

    if (preferredName) {
      if (!nameToPlaces.has(preferredName)) {
        nameToPlaces.set(preferredName, []);
      }
      nameToPlaces.get(preferredName)!.push({
        id: plantation.id,
        name: preferredName,
        locationDescription: plantation.locationDescription,
        district: plantation.district,
      });
    }
  }

  const uniqueNames = Array.from(nameToPlaces.keys());
  console.log(`Total unique plantage names: ${uniqueNames.length}`);

  // Find fuzzy duplicates (similarity 0.8 or higher, but not identical)
  const fuzzyDuplicates: PlantationCluster[] = [];
  const fuzzyEdges: ClusterEdge[] = [];
  const seenPairs = new Set<string>();

  for (let i = 0; i < uniqueNames.length; i++) {
    for (let j = i + 1; j < uniqueNames.length; j++) {
      const name1 = uniqueNames[i];
      const name2 = uniqueNames[j];

      // Skip if already identical
      if (name1 === name2) continue;

      const similarity = levenshteinSimilarity(name1, name2);
      if (similarity >= 0.8) {
        const pairKey = [name1, name2].sort().join('||');
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);

          const places1 = nameToPlaces.get(name1) || [];
          const places2 = nameToPlaces.get(name2) || [];
          const combinedPlaces = [...places1, ...places2];

          if (!hasDifferentKnownLocations(combinedPlaces)) {
            continue;
          }

          fuzzyDuplicates.push({
            similarity,
            name1,
            name2,
            count: places1.length + places2.length,
            plantations: combinedPlaces,
          });

          fuzzyEdges.push({
            similarity,
            name1,
            name2,
          });
        }
      }
    }
  }

  // Sort by similarity (descending)
  fuzzyDuplicates.sort((a, b) => b.similarity - a.similarity);

  // Write JSON report
  const reportPath = path.join(LOD_DIR, 'fuzzy-duplicate-names.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(fuzzyDuplicates, null, 2));

  // Write CSV report
  const csvPath = path.join(LOD_DIR, 'fuzzy-duplicate-names.csv');
  let csvContent =
    'similarity,name1,name2,totalCount,stmId,plantationName,locationDescription,district\n';

  for (const dup of fuzzyDuplicates) {
    for (const plant of dup.plantations) {
      const locDesc = plant.locationDescription
        ? plant.locationDescription.replace(/"/g, '""')
        : '';
      const dist = plant.district || '';
      csvContent += `${dup.similarity.toFixed(3)},"${dup.name1}","${dup.name2}",${dup.count},${plant.id},"${plant.name}","${locDesc}","${dist}"\n`;
    }
  }

  fs.writeFileSync(csvPath, csvContent);

  // Build connected components so each name cluster appears on a single row.
  const adjacency = new Map<string, Set<string>>();
  for (const name of uniqueNames) {
    adjacency.set(name, new Set<string>());
  }
  for (const edge of fuzzyEdges) {
    adjacency.get(edge.name1)!.add(edge.name2);
    adjacency.get(edge.name2)!.add(edge.name1);
  }

  const visited = new Set<string>();
  const wideClusters: Array<{
    variants: string[];
    entries: PlantationEntry[];
  }> = [];

  for (const name of uniqueNames) {
    if (visited.has(name)) {
      continue;
    }

    const neighbors = adjacency.get(name);
    if (!neighbors || neighbors.size === 0) {
      visited.add(name);
      continue;
    }

    const queue: string[] = [name];
    visited.add(name);
    const component: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      for (const next of adjacency.get(current) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    const sortedVariants = component.slice().sort((a, b) => a.localeCompare(b));
    const entryById = new Map<string, PlantationEntry>();

    for (const variant of sortedVariants) {
      const variantPlaces = nameToPlaces.get(variant) || [];
      for (const place of variantPlaces) {
        if (!entryById.has(place.id)) {
          entryById.set(place.id, place);
        }
      }
    }

    const entries = Array.from(entryById.values());
    if (!hasDifferentKnownLocations(entries)) {
      continue;
    }

    wideClusters.push({
      variants: sortedVariants,
      entries,
    });
  }

  // Also include exact-duplicate names without fuzzy edges (single variant, multiple locations).
  for (const [name, places] of nameToPlaces.entries()) {
    if (adjacency.get(name)?.size) {
      continue;
    }
    if (places.length < 2) {
      continue;
    }
    if (!hasDifferentKnownLocations(places)) {
      continue;
    }

    wideClusters.push({
      variants: [name],
      entries: places,
    });
  }

  const allLocationDescriptions = Array.from(
    new Set(
      wideClusters
        .flatMap((cluster) => cluster.entries)
        .map((entry) => normalizeLocationDescription(entry.locationDescription))
        .filter((location) => location.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));

  const wideHeader = [
    'clusterIndex',
    'variants',
    'clusterLocationsSummary',
    'clusterKnownSpellingsSummary',
    ...allLocationDescriptions,
    'variantCount',
    'recordCount',
  ];
  let wideCsvContent = `${wideHeader.map(escapeCsv).join(',')}\n`;

  const sortedWideClusters = wideClusters.sort((a, b) => {
    const aKey = a.variants[0] || '';
    const bKey = b.variants[0] || '';
    return aKey.localeCompare(bKey);
  });

  for (let i = 0; i < sortedWideClusters.length; i++) {
    const cluster = sortedWideClusters[i];
    const entriesByLocation = new Map<string, string[]>();

    for (const location of allLocationDescriptions) {
      entriesByLocation.set(location, []);
    }

    for (const entry of cluster.entries) {
      const location = normalizeLocationDescription(entry.locationDescription);
      if (!location) {
        continue;
      }
      const label = `${entry.id} (${entry.name})`;
      entriesByLocation.get(location)!.push(label);
    }

    const row: string[] = [
      `${i + 1}`,
      cluster.variants.join(' | '),
      Array.from(
        new Set(
          cluster.entries
            .map((entry) => normalizeLocationDescription(entry.locationDescription))
            .filter((location) => location.length > 0)
        )
      )
        .sort((a, b) => a.localeCompare(b))
        .join(' | '),
      Array.from(
        new Set(
          cluster.entries.flatMap((entry) => idToKnownSpellings.get(entry.id) || [entry.name])
        )
      )
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .sort((a, b) => a.localeCompare(b))
        .join(' | '),
      ...allLocationDescriptions.map((location) =>
        (entriesByLocation.get(location) || []).join('; ')
      ),
      `${cluster.variants.length}`,
      `${cluster.entries.length}`,
    ];

    wideCsvContent += `${row.map(escapeCsv).join(',')}\n`;
  }

  const wideCsvPath = path.join(LOD_DIR, 'fuzzy-duplicate-names-wide.csv');
  fs.writeFileSync(wideCsvPath, wideCsvContent);

  // Print summary
  console.log(`\n===== FUZZY DUPLICATES REPORT =====\n`);
  console.log('Manual baseline: only pairs with different known locations are included.');
  console.log(
    `Plantage name pairs with similarity >= 80%: ${fuzzyDuplicates.length}`
  );
  console.log(`\nTop 30 closest name matches:\n`);

  for (let i = 0; i < Math.min(30, fuzzyDuplicates.length); i++) {
    const dup = fuzzyDuplicates[i];
    console.log(
      `${i + 1}. "${dup.name1}" ≈ "${dup.name2}" (${(dup.similarity * 100).toFixed(1)}% match, ${dup.count} total entries)`
    );
    for (const plant of dup.plantations) {
      const location = plant.locationDescription
        ? ` - ${plant.locationDescription}`
        : '';
      const districtInfo = plant.district ? ` [${plant.district}]` : '';
      console.log(`   ${plant.id}: ${plant.name}${location}${districtInfo}`);
    }
  }

  console.log(`\n✓ Reports saved to:`);
  console.log(`  - ${reportPath} (JSON)`);
  console.log(`  - ${csvPath} (CSV)`);
  console.log(`  - ${wideCsvPath} (CSV, wide table for manual review)`);
}

generateFuzzyDuplicateReport().catch(console.error);
