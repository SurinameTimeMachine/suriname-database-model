export type HistoricMapDefinition = {
  id: string;
  label: string;
  annotationUrl: string;
  transformation: string;
  gcpCount: number;
};

const annotationUrl = (id: string) => `https://annotations.allmaps.org/maps/${id}`;

/**
 * Curated, independently georeferenced historic maps. Each annotation and
 * IIIF image service was checked before inclusion on 2026-06-24.
 */
export const HISTORIC_MAPS: HistoricMapDefinition[] = [
  { id: 'f9e0aafd0b1ebb35', label: 'Platte grond van de stad Paramaribo', annotationUrl: annotationUrl('f9e0aafd0b1ebb35'), transformation: 'polynomial', gcpCount: 8 },
  { id: '6ee8c9d9b99a4793', label: 'Historic map (UvA collection)', annotationUrl: annotationUrl('6ee8c9d9b99a4793'), transformation: 'polynomial', gcpCount: 9 },
  { id: '280903e43524e3b1', label: 'Kaart van de rivier de Suriname', annotationUrl: annotationUrl('280903e43524e3b1'), transformation: 'polynomial', gcpCount: 6 },
  { id: '3b03c90259ceba47', label: 'Paramaribo', annotationUrl: annotationUrl('3b03c90259ceba47'), transformation: 'helmert', gcpCount: 23 },
  { id: 'f3de087063e23ba1', label: 'Telephoonnet in Suriname', annotationUrl: annotationUrl('f3de087063e23ba1'), transformation: 'thinPlateSpline', gcpCount: 19 },
  { id: '158cc8bc8bb4f8cc', label: 'D A 57,5', annotationUrl: annotationUrl('158cc8bc8bb4f8cc'), transformation: 'polynomial', gcpCount: 10 },
  { id: '16c6b6d5abbf83c2', label: 'Kaart van Suriname — scholen', annotationUrl: annotationUrl('16c6b6d5abbf83c2'), transformation: 'polynomial', gcpCount: 9 },
  { id: '5ac7f01cb998371c', label: 'Paramaribo — grondlagen', annotationUrl: annotationUrl('5ac7f01cb998371c'), transformation: 'polynomial', gcpCount: 11 },
  { id: '5b653622d57a0754', label: 'Overzichtskaart van Paramaribo', annotationUrl: annotationUrl('5b653622d57a0754'), transformation: 'polynomial', gcpCount: 8 },
  { id: '0595a7c79be812a1', label: 'Plattegrond van de stad Paramaribo', annotationUrl: annotationUrl('0595a7c79be812a1'), transformation: 'thinPlateSpline', gcpCount: 7 },
  { id: '1ccb1b2186250c4f', label: 'NL-HaNA 4.MIKO 635', annotationUrl: annotationUrl('1ccb1b2186250c4f'), transformation: 'thinPlateSpline', gcpCount: 13 },
  { id: 'bcdb8c2491934ad2', label: 'D A 52,2', annotationUrl: annotationUrl('bcdb8c2491934ad2'), transformation: 'thinPlateSpline', gcpCount: 12 },
  { id: '18504f12f5649ce7', label: 'Kaart van de Beneden-Marowijne', annotationUrl: annotationUrl('18504f12f5649ce7'), transformation: 'polynomial', gcpCount: 15 },
  { id: '6ab27027e42e4236', label: 'Plan van Paramaribo', annotationUrl: annotationUrl('6ab27027e42e4236'), transformation: 'polynomial', gcpCount: 13 },
  { id: '414b28b6c1aaa7fc', label: 'Overzichtskaart van het district Nickerie', annotationUrl: annotationUrl('414b28b6c1aaa7fc'), transformation: 'polynomial', gcpCount: 8 },
  { id: 'b3c585d6c5402eae', label: 'Plan de la ville de Paramaribo et de ses environs', annotationUrl: annotationUrl('b3c585d6c5402eae'), transformation: 'thinPlateSpline', gcpCount: 7 },
  { id: 'c1bc55233ed14d0e', label: 'Kaart van de Marowijne', annotationUrl: annotationUrl('c1bc55233ed14d0e'), transformation: 'thinPlateSpline', gcpCount: 4 },
  { id: '24a5c24239a55c38', label: 'Historic map (UvA collection)', annotationUrl: annotationUrl('24a5c24239a55c38'), transformation: 'helmert', gcpCount: 21 },
  { id: '52fd0e7ad1eeefe0', label: 'D A 56,7', annotationUrl: annotationUrl('52fd0e7ad1eeefe0'), transformation: 'helmert', gcpCount: 14 },
  { id: '095b7bfbc102c05c', label: 'Historic map (Leiden collection)', annotationUrl: annotationUrl('095b7bfbc102c05c'), transformation: 'thinPlateSpline', gcpCount: 15 },
];

export const HISTORIC_MAP_URLS = HISTORIC_MAPS.map((map) => map.annotationUrl);
