// Shared between the client review UI and the server-side event store, so it must stay free of Node-only imports.

export const LOCATION_TYPES = ['straat/adres', 'gebouw', 'plaatsnaam', 'plantage', 'rivier/waterweg', 'land', 'anders'] as const;

export type LocationType = (typeof LOCATION_TYPES)[number];

export type AddedPlace = {
  text: string;
  type: LocationType | '';
};
