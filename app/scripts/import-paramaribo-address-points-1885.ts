/**
 * Import editable historical address observations from the 1885 Paramaribo
 * georeferenced QGIS layer. The source GeoJSON remains immutable in data/;
 * this script creates one Gazetteer record per valid source point.
 *
 * The records are E53 Places because they are source-specific address
 * locations, not claims about a persistent building or organisation.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const GAZETTEER_PATH = join(ROOT, 'data', 'places-gazetteer.jsonld');
const SOURCE_PATH = join(
  ROOT,
  'data',
  '08-place-points-qgis',
  'export20260619',
  'locatiepunten1885.geojson',
);
const SOURCE_ID = 'historic-map-27';
const LAYER = 'locatiepunten1885';

type Properties = {
  wijk1885?: string | null;
  huisnummer1885?: string | number | null;
  beschrijving1854?: string | null;
  beschrijving1885?: string | null;
  beschrijving1916?: string | null;
  adres1885?: string | null;
  straatnaam1885?: string | null;
};

type PointFeature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Properties;
};

type FeatureCollection = { features?: PointFeature[] };
type GazetteerDocument = { '@graph'?: Array<Record<string, unknown>> };

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function addressLabel(properties: Properties, sourceIndex: number): string {
  const street = text(properties.straatnaam1885);
  const address = text(properties.adres1885);
  if (street && address) return `${street}, ${address}`;
  if (address) return address;
  if (street) return street;
  return `Unlabelled address point ${sourceIndex} (1885)`;
}

function sourceNote(properties: Properties): string | null {
  const values = [
    ['1854', text(properties.beschrijving1854)],
    ['1885', text(properties.beschrijving1885)],
    ['1916', text(properties.beschrijving1916)],
  ].filter(([, value]) => Boolean(value)) as Array<[string, string]>;
  return values.length > 0
    ? values.map(([year, value]) => `${year}: ${value}`).join('; ')
    : null;
}

function main() {
  const write = process.argv.includes('--write');
  const source = JSON.parse(readFileSync(SOURCE_PATH, 'utf-8')) as FeatureCollection;
  const gazetteer = JSON.parse(
    readFileSync(GAZETTEER_PATH, 'utf-8'),
  ) as GazetteerDocument;
  const graph = gazetteer['@graph'] ?? [];
  const existingIds = new Set(
    graph
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === 'string'),
  );
  const entriesById = new Map(
    graph
      .filter((entry): entry is Record<string, unknown> & { id: string } =>
        typeof entry.id === 'string',
      )
      .map((entry) => [entry.id, entry]),
  );

  let imported = 0;
  let skippedExisting = 0;
  let skippedWithoutPoint = 0;

  for (const [offset, feature] of (source.features ?? []).entries()) {
    const sourceIndex = offset + 1;
    const coordinates = feature.geometry?.coordinates;
    if (
      feature.geometry?.type !== 'Point' ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !Number.isFinite(Number(coordinates[0])) ||
      !Number.isFinite(Number(coordinates[1]))
    ) {
      skippedWithoutPoint++;
      continue;
    }

    const id = `stm-1885-address-${String(sourceIndex).padStart(4, '0')}`;
    const existing = entriesById.get(id);
    if (existing) {
      // The record ID is the persistent location-point anchor. Retain all
      // editorial changes and only add this structural marker on re-runs.
      if (existing.locationPoint !== true) existing.locationPoint = true;
      skippedExisting++;
      continue;
    }

    const properties = feature.properties ?? {};
    const label = addressLabel(properties, sourceIndex);
    const ward = text(properties.wijk1885);
    const originalAddress = text(properties.adres1885);
    const note = sourceNote(properties);
    const lat = Number(coordinates[1]);
    const lng = Number(coordinates[0]);

    graph.push({
      '@id': `https://data.surinametijdmachine.org/place/${id}`,
      '@type': 'E53_Place',
      id,
      type: 'historical-address',
      names: [
        {
          text: label,
          language: 'nl',
          type: 'historical',
          isPreferred: true,
          source: SOURCE_ID,
          sourceYear: 1885,
        },
      ],
      broader: null,
      description: note ?? '',
      location: {
        lat,
        lng,
        wkt: `POINT (${lng} ${lat})`,
        crs: 'OGC:CRS84',
      },
      sources: [SOURCE_ID],
      externalLinks: [],
      fid: sourceIndex,
      psurIds: [],
      district: ward ? `Wijk ${ward}` : null,
      locationDescription: ward ? `Wijk ${ward}` : null,
      locationDescriptionOriginal: originalAddress,
      placeType: null,
      productAssertions: [],
      statusAssertions: [],
      locationPoint: true,
      districtAssertions: [],
      locationAssertions: [
        {
          id: 'address-observation-1885',
          standardized: label,
          original: originalAddress,
          source: SOURCE_ID,
          startYear: 1885,
          note,
          sourceRow: `${LAYER}#${sourceIndex}`,
        },
      ],
      diklandRefs: [],
      modifiedBy: null,
      modifiedAt: null,
      sourceRecord: {
        dataset: '08-place-points-qgis',
        layer: LAYER,
        featureIndex: sourceIndex,
      },
    });
    imported++;
  }

  if (write) {
    gazetteer['@graph'] = graph;
    writeFileSync(GAZETTEER_PATH, `${JSON.stringify(gazetteer, null, 2)}\n`);
  }

  console.log(
    `${write ? 'Imported' : 'Would import'} ${imported} address points; ${skippedExisting} already present; ${skippedWithoutPoint} source rows have no point geometry.`,
  );
}

main();
