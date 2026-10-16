/*
 * Search page for suriname_person_search.db, served by Datasette.
 *
 * Uses only the canned queries named ui_* in scripts/person_search/metadata.yaml
 * (Datasette JSON API, ?_shape=array). No free SQL, no external libraries.
 * State lives in the URL hash so searches and person cards can be bookmarked.
 */
'use strict';

const DB = '/suriname_person_search';
const PAGE = 50;

// ---------------------------------------------------------------------------
// Labels (Dutch default, English toggle)
// ---------------------------------------------------------------------------
const T = {
  nl: {
    title: 'Suriname Time Machine · Personen zoeken', search: 'Zoeken', all: 'Alle',
    dataset: 'Bron', role: 'Rol', from: 'Van jaar', to: 'Tot jaar', place: 'Plaats / plantage',
    sort: 'Sorteren', sortRel: 'Beste match', sortYear: 'Jaar', reset: 'Filters wissen',
    placeholder: 'Zoek op naam, plaats of beroep…', placePh: 'bijv. Commewijne', back: '← Terug', ship: 'schip',
    loading: 'Zoeken…', results: n => `${n.toLocaleString('nl-NL')} vermeldingen gevonden`,
    noResults: 'Niets gevonden. Probeer een deel van de naam, of minder filters.',
    page: (a, b) => `${a}–${b}`, prev: '← Vorige', next: 'Volgende →',
    facetDataset: 'Bron', facetRole: 'Rol', facetDecade: 'Periode', facetLocation: 'Locatie',
    showAll: n => `Toon alle ${n.toLocaleString('nl-NL')}`, showLess: 'Toon minder',
    person: 'Persoon', record: 'Bron / akte', onRecord: 'Op dezelfde akte / hetzelfde record',
    relations: 'Relaties', otherNames: 'Andere namen en herkomst', notes: 'Opmerkingen en aantekeningen',
    sameName: 'Zelfde naam elders – mogelijk dezelfde persoon (niet automatisch gekoppeld)',
    links: 'Bekijken bij het archief', none: 'Geen.', you: '(deze persoon)', probable: 'waarschijnlijk', possible: 'mogelijk',
    samePerson: 'Dezelfde persoon in een andere bron (kandidaat, niet samengevoegd)',
    recordPlaces: 'Plaatsen in dit record', resolved: 'afgeleid uit eerdere vermelding in de akte',
    via: { name: 'zelfde naam', emancipation_name: 'via emancipatienaam', former_name: 'via eerdere naam',
           orig_spelling: 'via oorspronkelijke spelling', maiden_name: 'via meisjesnaam',
           widow_name: 'via weduwenaam', baptized_name: 'via doopnaam', display_name: 'via weergavenaam' },
    restricted: 'Beperkte bron: alleen voor intern gebruik door het projectteam. Niet delen of publiceren.',
    pairAdd: '+ Samen met een tweede persoon (op hetzelfde record)', pairLabel: 'Samen met (op hetzelfde record)',
    pairPh: 'Naam van de tweede persoon', role2: 'Rol tweede persoon', pairClear: 'Verwijderen', with: 'samen met',
    facetRole2: 'Rol tweede persoon', pairResults: n => `${n.toLocaleString('nl-NL')} records met beide personen`,
    modeLabel: 'Zoekwijze', modePrefix: 'Woordbegin', modeExact: 'Exact (hele woorden)', modeFuzzy: 'Fuzzy (spellingvarianten)',
    viewPersons: 'Personen', viewPlaces: 'Plaatsen', help: 'Hoe zoek ik?',
    placesPh: 'Zoek een plaats, plantage, straat of district…',
    placesFound: n => `${n.toLocaleString('nl-NL')} plaatsnamen gevonden (meest voorkomend eerst)`,
    placesMore: 'Alleen de eerste 200 worden getoond; maak de zoekterm specifieker.',
    records: n => `${n.toLocaleString('nl-NL')} records`, allPlaces: '← Alle plaatsnamen',
    personsAt: 'Personen op records met plaats', permalink: 'Vaste link', copy: 'Kopieer', copied: 'Gekopieerd',
    fuzzyEmpty: 'Fuzzy zoeken werkt alleen op namen; vul een naam in (lidwoorden als "van" en "de" tellen niet mee).',
    helpHtml: `<p><b>Personen</b> – alle woorden die je typt moeten voorkomen, in elke volgorde, in naam, alias,
      eerdere naam, plaats of beroep. Hoofdletters en accenten tellen niet.</p>
      <ul><li><b>Woordbegin</b> (standaard): elk woord mag het begin van een woord zijn – <i>jan</i> vindt Jan, Janna, Jansen
        (maar niet Bijan; midden in een woord zoeken kan niet).</li>
      <li><b>Exact</b>: alleen hele woorden – <i>jan</i> vindt alleen Jan.</li>
      <li><b>Fuzzy</b>: vindt bekende spellingvarianten – ij/ei/y, oe/ou, dj/j, tj/ch, c/k, ph/f, sch/s, dt/d/t,
        dubbele letters: <i>Meijer</i> vindt ook Meyer en Meier, <i>Smit</i> ook Schmidt, <i>Ponidja</i> ook Ponidjah.
        Alleen voor namen, hele woorden.</li></ul>
      <p><b>Samen met een tweede persoon</b> – vind records waarop twee personen samen voorkomen, eventueel met een
      rol per persoon: bijv. vader <i>Jan</i> + moeder <i>Maria</i> vindt de geboorteakten van hun kinderen.</p>
      <p><b>Plaatsen</b> – zoek een plaats-, plantage-, straat- of districtsnaam (ook midden in een woord) en klik op een
      plaatsnaam om alle personen te zien op records met die plaats. Elke spelling is nog een aparte plaatsnaam.</p>
      <p>Elk resultaat is één <b>vermelding</b> van een persoon in één bron. Klik om de persoonskaart te openen;
      met Ctrl+klik (Cmd+klik op een Mac) of de middelste muisknop opent hij in een nieuw tabblad.
      De link van een persoonskaart is vast en kan bewaard worden.</p>`,
    error: 'Er ging iets mis bij het ophalen: ',
    introHtml: `<p>Zoek in één keer door alle persoonsbronnen van de Suriname Time Machine.
      Typ een naam (of een deel ervan), een plaats of een beroep. Meerdere woorden worden allemaal gezocht,
      in elke volgorde. Een woord mag een begin zijn: <i>badl</i> vindt ook <i>Badloe</i>.</p>
      <p>Elke regel in de resultaten is één <b>vermelding</b> van een persoon in één bron. Dezelfde persoon kan
      dus meerdere keren voorkomen; op de persoonskaart staan mogelijke overeenkomsten in andere bronnen.</p>`,
  },
  en: {
    title: 'Suriname Time Machine · Person search', search: 'Search', all: 'All',
    dataset: 'Source', role: 'Role', from: 'From year', to: 'To year', place: 'Place / plantation',
    sort: 'Sort', sortRel: 'Best match', sortYear: 'Year', reset: 'Clear filters',
    placeholder: 'Search by name, place or occupation…', placePh: 'e.g. Commewijne', back: '← Back', ship: 'ship',
    loading: 'Searching…', results: n => `${n.toLocaleString('en-GB')} mentions found`,
    noResults: 'Nothing found. Try part of the name, or fewer filters.',
    page: (a, b) => `${a}–${b}`, prev: '← Previous', next: 'Next →',
    facetDataset: 'Source', facetRole: 'Role', facetDecade: 'Period', facetLocation: 'Location',
    showAll: n => `Show all ${n.toLocaleString('en-GB')}`, showLess: 'Show less',
    person: 'Person', record: 'Source / record', onRecord: 'On the same record',
    relations: 'Relations', otherNames: 'Other names and origin', notes: 'Remarks and notes',
    sameName: 'Same name elsewhere – possibly the same person (not linked automatically)',
    links: 'View at the archive', none: 'None.', you: '(this person)', probable: 'probable', possible: 'possible',
    samePerson: 'Same person in another source (candidate, not merged)',
    recordPlaces: 'Places on this record', resolved: 'resolved from an earlier mention in the certificate',
    via: { name: 'same name', emancipation_name: 'via emancipation name', former_name: 'via former name',
           orig_spelling: 'via original spelling', maiden_name: 'via maiden name',
           widow_name: 'via widow name', baptized_name: 'via baptismal name', display_name: 'via display name' },
    restricted: 'Restricted source: internal use by the project team only. Do not share or publish.',
    pairAdd: '+ Together with a second person (on the same record)', pairLabel: 'Together with (on the same record)',
    pairPh: 'Name of the second person', role2: 'Role of second person', pairClear: 'Remove', with: 'with',
    facetRole2: 'Role of second person', pairResults: n => `${n.toLocaleString('en-GB')} records with both persons`,
    modeLabel: 'Search mode', modePrefix: 'Word start', modeExact: 'Exact (whole words)', modeFuzzy: 'Fuzzy (spelling variants)',
    viewPersons: 'Persons', viewPlaces: 'Places', help: 'How to search?',
    placesPh: 'Search a place, plantation, street or district…',
    placesFound: n => `${n.toLocaleString('en-GB')} place names found (most frequent first)`,
    placesMore: 'Only the first 200 are shown; make the search more specific.',
    records: n => `${n.toLocaleString('en-GB')} records`, allPlaces: '← All place names',
    personsAt: 'Persons on records with place', permalink: 'Permanent link', copy: 'Copy', copied: 'Copied',
    fuzzyEmpty: 'Fuzzy search works on names only; enter a name (particles such as "van" and "de" are ignored).',
    helpHtml: `<p><b>Persons</b> – every word you type must occur, in any order, in a name, alias, former name,
      place or occupation. Case and accents are ignored.</p>
      <ul><li><b>Word start</b> (default): each word may be the start of a word – <i>jan</i> finds Jan, Janna, Jansen
        (not Bijan; searching inside a word is not possible).</li>
      <li><b>Exact</b>: whole words only – <i>jan</i> finds only Jan.</li>
      <li><b>Fuzzy</b>: finds common spelling variants – ij/ei/y, oe/ou, dj/j, tj/ch, c/k, ph/f, sch/s, dt/d/t,
        double letters: <i>Meijer</i> also finds Meyer and Meier, <i>Smit</i> also Schmidt, <i>Ponidja</i> also Ponidjah.
        Names only, whole words.</li></ul>
      <p><b>Together with a second person</b> – find records on which two persons occur together, optionally with
      a role for each: e.g. father <i>Jan</i> + mother <i>Maria</i> finds the birth certificates of their children.</p>
      <p><b>Places</b> – search a place, plantation, street or district name (also inside words) and click a place
      name to see all persons on records with that place. Each spelling is still a separate place name.</p>
      <p>Each result is one <b>mention</b> of a person in one source. Click to open the person card; Ctrl+click
      (Cmd+click on a Mac) or the middle mouse button opens it in a new tab. The link of a person card is permanent.</p>`,
    error: 'Something went wrong while loading: ',
    introHtml: `<p>Search all person sources of the Suriname Time Machine at once.
      Type a name (or part of it), a place or an occupation. All words are searched, in any order.
      A word may be a beginning: <i>badl</i> also finds <i>Badloe</i>.</p>
      <p>Each result is one <b>mention</b> of a person in one source, so the same person can appear
      several times; the person card lists possible matches in other sources.</p>`,
  },
};

const DATASETS = {
  '02-death': { nl: 'Overlijdensakten 1845–1915', en: 'Death certificates 1845–1915' },
  '03-birth': { nl: 'Geboorteakten Paramaribo 1828–1921', en: 'Birth certificates Paramaribo 1828–1921' },
  '04-ward-registers': { nl: 'Wijkregisters Paramaribo 1828–1847', en: 'Ward registers Paramaribo 1828–1847' },
  '05-slave-emancipation': { nl: 'Slavenregisters en emancipatie', en: 'Slave and emancipation registers' },
  '06-almanakken': { nl: 'Surinaamse Almanakken', en: 'Surinamese almanacs' },
  '09-volkstelling-1921': { nl: 'Volkstelling 1921', en: 'Census 1921' },
  '10-volkstelling-1950': { nl: 'Volkstelling 1950', en: 'Census 1950' },
  '11-madeisu': { nl: 'Madeirese contractarbeiders 1853–1864', en: 'Madeiran contract labourers 1853–1864', restricted: true },
  '12-migratie-datasets': { nl: 'Immigratieregisters', en: 'Immigration registers', restricted: true },
  '13-civil': { nl: 'Burgerlijke stand (embargo)', en: 'Civil records (embargo)', restricted: true },
};

const COLLECTIONS = {
  'migration-hindostani': { nl: 'Hindostanen', en: 'Hindostani' },
  'migration-chinese': { nl: 'Chinezen', en: 'Chinese' },
  'migration-javanese': { nl: 'Javanen', en: 'Javanese' },
};

const ROLES = {
  nl: {
    deceased: 'overledene', informant: 'aangever', parent: 'ouder', witness: 'getuige', spouse: 'echtgeno(o)t(e)',
    child: 'kind', mother: 'moeder', father: 'vader', resident: 'bewoner', owner: 'eigenaar', heirs: 'erfgenamen',
    enslaved: 'tot slaaf gemaakt', emancipated: 'geëmancipeerd', administrator: 'administrateur',
    director: 'directeur', administrator_europe: 'administrateur (Europa)',
    administrator_suriname: 'administrateur (Suriname)', blank_officier: 'blankofficier',
    contract_worker: 'contractarbeider', migrant: 'immigrant (contractarbeider)', declarant: 'comparant',
    parent_groom: 'ouder bruidegom', parent_bride: 'ouder bruid', bride: 'bruid', groom: 'bruidegom',
    custodian: 'voogd', custodian_parent: 'voogd (ouder)',
  },
  en: {
    deceased: 'deceased', informant: 'informant', parent: 'parent', witness: 'witness', spouse: 'spouse',
    child: 'child', mother: 'mother', father: 'father', resident: 'resident', owner: 'owner', heirs: 'heirs',
    enslaved: 'enslaved', emancipated: 'emancipated', administrator: 'administrator', director: 'director',
    administrator_europe: 'administrator (Europe)', administrator_suriname: 'administrator (Suriname)',
    blank_officier: 'blank officer', contract_worker: 'contract labourer', migrant: 'immigrant (contract labourer)',
    declarant: 'declarant', parent_groom: "groom's parent", parent_bride: "bride's parent", bride: 'bride',
    groom: 'groom', custodian: 'guardian', custodian_parent: 'guardian (parent)',
  },
};

// What the OTHER person is to the person on the card: [relation_type][direction].
// direction 'out' = this person is the "from" side (e.g. the parent, the witness).
const REL = {
  nl: {
    'parent-child': { out: 'kind', in: 'ouder' }, spouse: { out: 'echtgeno(o)t(e)', in: 'echtgeno(o)t(e)' },
    sibling: { out: 'broer/zus', in: 'broer/zus' }, foster: { out: 'pleegkind', in: 'pleegouder' },
    witness: { out: 'getuige bij akte van', in: 'getuige' }, declarant: { out: 'comparant voor', in: 'comparant' },
    informant: { out: 'aangifte gedaan van', in: 'aangever' },
    'enslaver-enslaved': { out: 'tot slaaf gemaakt', in: 'eigenaar' },
    'employer-plantation': { out: 'plantage', in: 'werkgever' }, 'owner-property': { out: 'eigendom', in: 'eigenaar' },
    related: { out: 'verwant', in: 'verwant' }, 'same-person': { out: 'zelfde persoon', in: 'zelfde persoon' },
  },
  en: {
    'parent-child': { out: 'child', in: 'parent' }, spouse: { out: 'spouse', in: 'spouse' },
    sibling: { out: 'sibling', in: 'sibling' }, foster: { out: 'foster child', in: 'foster parent' },
    witness: { out: 'witness on record of', in: 'witness' }, declarant: { out: 'declarant for', in: 'declarant' },
    informant: { out: 'reported the event of', in: 'informant' },
    'enslaver-enslaved': { out: 'enslaved', in: 'owner' },
    'employer-plantation': { out: 'plantation', in: 'employer' }, 'owner-property': { out: 'property', in: 'owner' },
    related: { out: 'relative', in: 'relative' }, 'same-person': { out: 'same person', in: 'same person' },
  },
};
const PARENT_DETAIL = { nl: { mother: 'moeder', father: 'vader' }, en: { mother: 'mother', father: 'father' } };

const PERSON_FIELDS = [
  ['given_name', 'Voornaam', 'Given name'], ['name_prefix', 'Tussenvoegsel', 'Prefix'],
  ['surname', 'Achternaam', 'Surname'], ['alias', 'Alias', 'Alias'], ['former_name', 'Eerdere naam', 'Former name'],
  ['sex', 'Geslacht', 'Sex'], ['age', 'Leeftijd', 'Age'], ['birth_date', 'Geboortedatum', 'Birth date'],
  ['birth_year', 'Geboortejaar', 'Birth year'], ['death_date', 'Overlijdensdatum', 'Death date'],
  ['event_date', 'Datum', 'Date'], ['event_year', 'Jaar', 'Year'], ['origin', 'Herkomst / geboorteland', 'Origin / birth country'],
  ['nationality', 'Nationaliteit', 'Nationality'], ['ethnicity', 'Etniciteit', 'Ethnicity'],
  ['religion', 'Godsdienst', 'Religion'], ['occupation', 'Beroep', 'Occupation'], ['literacy', 'Geletterdheid', 'Literacy'],
  ['status', 'Status', 'Status'], ['location', 'Plaats', 'Place'], ['address_text', 'Adres', 'Address'],
  ['ward_code', 'Wijk', 'Ward'], ['district', 'District', 'District'], ['plantation_name', 'Plantage', 'Plantation'],
  ['contract_number', 'Contractnummer', 'Contract number'], ['registration_number', 'Registratienummer', 'Registration number'],
  ['slavenregister_id', 'Slavenregister-ID', 'Slave register ID'],
];
const RECORD_FIELDS = [
  ['record_type', 'Soort record', 'Record type'], ['collection', 'Collectie', 'Collection'],
  ['register', 'Register', 'Register'], ['record_event_date', 'Datum gebeurtenis', 'Event date'],
  ['record_date', 'Datum akte', 'Record date'], ['record_place', 'Plaats', 'Place'],
  ['record_location', 'Locatie', 'Location'], ['record_district', 'District', 'District'],
  ['record_plantation', 'Plantage', 'Plantation'], ['record_ward', 'Wijk', 'Ward'],
  ['record_address', 'Adres / schip', 'Address / ship'], ['inventory_number', 'Inventarisnummer', 'Inventory number'],
  ['certificate_number', 'Aktenummer', 'Certificate number'], ['folio', 'Folio', 'Folio'], ['page', 'Pagina', 'Page'],
  ['series', 'Reeks', 'Series'], ['record_contract', 'Contractnummer', 'Contract number'],
  ['record_registration', 'Registratie-/monsternummer', 'Registration / muster number'],
  ['item_id', 'Scan- / record-ID', 'Scan / record ID'], ['dataset_title', 'Dataset', 'Dataset'],
  ['license', 'Licentie / status', 'Licence / status'],
];
const NAME_KINDS = {
  nl: { orig_spelling: 'Oorspronkelijke spelling', former_name: 'Eerdere naam', emancipation_name: 'Emancipatienaam',
        maiden_name: 'Meisjesnaam', widow_name: 'Weduwenaam', baptized_name: 'Doopnaam', display_name: 'Weergavenaam',
        father_name: 'Vadersnaam', spouse_name: 'Naam echtgeno(o)t(e)', suffix: 'Toevoeging',
        district: 'Herkomst: district', village: 'Herkomst: dorp / desa', residency: 'Herkomst: residentie (gewest)',
        division: 'Herkomst: afdeling', police_post: 'Herkomst: politiepost', place_of_origin: 'Plaats van herkomst' },
  en: { orig_spelling: 'Original spelling', former_name: 'Former name', emancipation_name: 'Emancipation name',
        maiden_name: 'Maiden name', widow_name: 'Widow name', baptized_name: 'Baptismal name', display_name: 'Display name',
        father_name: "Father's name", spouse_name: "Spouse's name", suffix: 'Suffix',
        district: 'Origin: district', village: 'Origin: village / desa', residency: 'Origin: residency',
        division: 'Origin: division', police_post: 'Origin: police post', place_of_origin: 'Place of origin' },
};
const RECORD_TYPES = {
  nl: { death_certificate: 'Overlijdensakte', birth_certificate: 'Geboorteakte', ward_register_entry: 'Wijkregister',
        emancipation_record: 'Emancipatieregister', slave_register_entry: 'Slavenregister',
        almanak_entry: 'Almanak', almanak_disambiguated: 'Almanak (gestandaardiseerde personen)',
        census_entry: 'Volkstelling', contract_record: 'Contractregister', plantation_placement: 'Plaatsing op plantage',
        erkenningen: 'Erkenningsakte', 'geboorten-districten': 'Geboorteakte (districten)', huwelijken: 'Huwelijksakte',
        echtscheidingen: 'Echtscheidingsakte' },
  en: { death_certificate: 'Death certificate', birth_certificate: 'Birth certificate', ward_register_entry: 'Ward register',
        emancipation_record: 'Emancipation register', slave_register_entry: 'Slave register',
        almanak_entry: 'Almanac', almanak_disambiguated: 'Almanac (standardised persons)',
        census_entry: 'Census', contract_record: 'Contract register', plantation_placement: 'Plantation placement',
        erkenningen: 'Recognition certificate', 'geboorten-districten': 'Birth certificate (districts)',
        huwelijken: 'Marriage certificate', echtscheidingen: 'Divorce certificate' },
};
const recordLabel = rt => (RECORD_TYPES[lang] || {})[rt] || rt;

const PLACE_FIELDS = {
  nl: { cert_place: 'Plaats akte', cert_location: 'Locatie akte', birth_place: 'Geboorteplaats', inf_place: 'Woonplaats aangever',
        moth_place: 'Woonplaats moeder', groom_place: 'Woonplaats bruidegom', bride_place: 'Woonplaats bruid',
        death_place: 'Plaats van overlijden', dec_place: 'Woonplaats overledene', dec_birthplace: 'Geboorteplaats overledene',
        plantation: 'Plantage', Plantage: 'Plantage', Woonplaats: 'Woonplaats', adres: 'Adres',
        district: 'Herkomst: district', village: 'Herkomst: dorp', residency: 'Herkomst: residentie', division: 'Herkomst: afdeling',
        police_post: 'Herkomst: politiepost', place_of_origin: 'Plaats van herkomst' },
  en: { cert_place: 'Record place', cert_location: 'Record location', birth_place: 'Birth place', inf_place: "Informant's residence",
        moth_place: "Mother's residence", groom_place: "Groom's residence", bride_place: "Bride's residence",
        death_place: 'Place of death', dec_place: "Deceased's residence", dec_birthplace: "Deceased's birth place",
        plantation: 'Plantation', Plantage: 'Plantation', Woonplaats: 'Residence', adres: 'Address',
        district: 'Origin: district', village: 'Origin: village', residency: 'Origin: residency', division: 'Origin: division',
        police_post: 'Origin: police post', place_of_origin: 'Place of origin' },
};
const placeFieldLabel = f => {
  const base = (f || '').replace(/ \(resolved\)$/, '');
  return (PLACE_FIELDS[lang][base] || base.replace(/_/g, ' ')) + (base !== f ? ` (${t('resolved')})` : '');
};
const SCAN_NOTES = { scan_registratielijst: 'Scan registratielijst (Nationaal Archief)', scan_klapper: 'Scan klapper (Nationaal Archief)' };

const NOTE_KINDS = {
  nl: { memo: 'Memo', photo_url: 'Foto', kinship_refs: 'Familieverwijzingen', recontracts: 'Hercontracten', court_ruling: 'Vonnis',
        civil_status_notes: 'Burgerlijke stand', family_notes: 'Familiegegevens', land_situation: 'Grondsituatie' },
  en: { memo: 'Memo', photo_url: 'Photo', kinship_refs: 'Kinship references', recontracts: 'Recontracts', court_ruling: 'Court ruling',
        civil_status_notes: 'Civil status', family_notes: 'Family details', land_situation: 'Land situation' },
};

// Links to the archives' own pages, per record. Returns [[label, url], ...].
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NA_INDEX = { 'migration-hindostani': 'nt00345', 'migration-chinese': 'nt00347', 'migration-javanese': 'nt00346' };
function archiveLinks(p) {
  const out = [];
  const id = p.item_id || '';
  if (p.source_dataset === '12-migratie-datasets' && UUID.test(id) && NA_INDEX[p.collection]) {
    out.push(['Nationaal Archief (index)', `https://www.nationaalarchief.nl/onderzoeken/index/${NA_INDEX[p.collection]}/${id}`]);
  }
  if (p.source_dataset === '09-volkstelling-1921' && UUID.test(id)) {
    out.push(['Nationaal Archief (index)', `https://www.nationaalarchief.nl/onderzoeken/index/nt00445/${id}`]);
  }
  const scan = id.match(/^NL-HaNA_(2\.\d+\.\d+(?:\.\d+)?)_([^_]+)_/);
  if (scan) {
    out.push(['Scan (Nationaal Archief)', `https://www.nationaalarchief.nl/onderzoeken/archief/${scan[1]}/invnr/${scan[2]}/file/${id}`]);
  }
  if (p.source_dataset === '11-madeisu') out.push(['Madeisu historisch register', 'https://www.madeisu.org/historisch-register/']);
  if (p.source_dataset === '12-migratie-datasets' && !out.length) {
    out.push(['Nationaal Archief Suriname (genealogie)', 'https://nationaalarchief.sr/onderzoeken/alle-genealogie']);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let lang = 'nl';
try { lang = localStorage.getItem('stm-lang') || 'nl'; } catch (e) { /* storage unavailable */ }
const t = key => T[lang][key];
const $ = sel => document.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dsLabel = ds => (DATASETS[ds] && DATASETS[ds][lang]) || ds;
const roleLabel = r => (ROLES[lang][r]) || (r || '').replace(/_/g, ' ');
const isRestricted = ds => !!(DATASETS[ds] && DATASETS[ds].restricted);

async function api(query, params = {}) {
  const qs = new URLSearchParams({ _shape: 'array', ...params });
  const res = await fetch(`${DB}/${query}.json?${qs}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data)) {
    throw new Error((data && (data.error || data.title)) || `HTTP ${res.status}`);
  }
  return data;
}

// Same steps as phonetic_key() in build_db.py; keep both in sync.
const PHONETIC_STOPWORDS = new Set(['van', 'de', 'der', 'den', 'het', 'ten', 'ter', 'te', 'la', 'le', 'du', 'des']);
const PHONETIC_RULES = [['sch', 's'], ['ck', 'k'], ['ph', 'f'], ['th', 't'], ['dj', 'j'], ['tj', 'ch'],
  ['ij', 'i'], ['ei', 'i'], ['ey', 'i'], ['ie', 'i'], ['y', 'i'], ['oe', 'u'], ['ou', 'u'], ['ae', 'a']];
const plain = w => w.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
function phoneticKey(word) {
  let t = plain(word).replace(/[^a-z]/g, '');
  if (!t || PHONETIC_STOPWORDS.has(t)) return '';
  t = t.replace(/c(?=[eiy])/g, 's').replace(/c(?!h)/g, 'k');
  for (const [a, b] of PHONETIC_RULES) t = t.split(a).join(b);
  return t.replace(/dt$|d$/, 't').replace(/([aeiou])h$/, '$1').replace(/(.)\1+/g, '$1');
}

// FTS5 expression: all words, any order.
//   ''      "maria"* "elis"*   (each word as a prefix)
//   exact   "maria" "elis"
//   fuzzy   "mir" "elisabet"   (spelling keys, searched in persons_phonetic_fts)
function ftsMatch(q, mode) {
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (mode === 'fuzzy') {
    return [...new Set(words.flatMap(w => w.split(/[^\p{L}]+/u)).map(phoneticKey).filter(Boolean))]
      .map(k => `"${k}"`).join(' ');
  }
  return words.map(w => '"' + w.replace(/"/g, '""') + '"' + (mode === 'exact' ? '' : '*')).join(' ');
}

// ---------------------------------------------------------------------------
// State in the URL hash
// ---------------------------------------------------------------------------
const KEYS = ['view', 'q', 'q2', 'role2', 'mode', 'dataset', 'role', 'from', 'to', 'place', 'loc', 'locl', 'sort', 'pk', 'pl', 'page', 'obs', 'person'];
const LOC_LIMIT = '2000';   // locations fetched for the facet; 15 shown until expanded
let showAllLocations = false;
function readState() {
  const h = new URLSearchParams(location.hash.slice(1));
  const s = {};
  KEYS.forEach(k => { s[k] = h.get(k) || ''; });
  return s;
}
function writeState(s, replace) {
  const h = new URLSearchParams();
  KEYS.forEach(k => { if (s[k]) h.set(k, s[k]); });
  const url = '#' + h.toString();
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  render();
}
function setState(patch, replace) { writeState({ ...readState(), ...patch }, replace); }
function hrefFor(patch) {
  const s = { ...readState(), ...patch };
  const h = new URLSearchParams();
  KEYS.forEach(k => { if (s[k]) h.set(k, s[k]); });
  return '#' + h.toString();
}
// person links carry the stable observation key; the row id is only a fallback
const personHref = (key, id) => hrefFor(key ? { obs: key, person: '' } : { person: String(id), obs: '' });

// ---------------------------------------------------------------------------
// Rendering: search results and facets
// ---------------------------------------------------------------------------
let lastSearchKey = null;

function filterParams(s) {
  return { match: ftsMatch(s.q, s.mode), mode: s.mode, dataset: s.dataset, role: s.role,
           year_from: s.from, year_to: s.to, place: s.place, loc: s.loc };
}
const commonFilters = s => ({ dataset: s.dataset, role: s.role, year_from: s.from, year_to: s.to, loc: s.loc });

async function renderSearch(s) {
  const key = JSON.stringify([s.view, s.q, s.q2, s.role2, s.mode, s.dataset, s.role, s.from, s.to, s.place, s.loc, s.sort, s.pk, s.page, lang]);
  if (key === lastSearchKey) return;
  lastSearchKey = key;
  const status = $('#status');
  status.className = 'status';
  $('#intro').innerHTML = (s.q || s.pk) ? '' : t('introHtml');
  const clear = () => { $('#list').innerHTML = ''; $('#pager').innerHTML = ''; $('#facets').innerHTML = ''; };
  if (s.view === 'places' && !s.pk) { clear(); return renderPlaceList(s, status, key); }
  if (!s.pk && !s.q.trim()) { status.textContent = ''; clear(); return; }
  const pair = !s.pk && s.view !== 'places' && s.q2.trim();
  const params = s.pk ? { place_norm: s.pk, ...commonFilters(s) } : filterParams(s);
  if (pair) Object.assign(params, { match2: ftsMatch(s.q2, s.mode), role2: s.role2 });
  if (!s.pk && (!params.match || (pair && !params.match2))) { status.textContent = t('fuzzyEmpty'); clear(); return; }
  status.textContent = t('loading');
  const page = Math.max(0, parseInt(s.page || '0', 10) || 0);
  try {
    const [rows, facets] = await Promise.all(pair ? [
      api('ui_pair_search', { ...params, offset: String(page * PAGE) }),
      api('ui_pair_facets', params),
    ] : s.pk ? [
      api('ui_place_search', { ...params, offset: String(page * PAGE) }),
      api('ui_place_facets', { ...params, loc_limit: LOC_LIMIT }),
    ] : [
      api('ui_search', { ...params, sort: s.sort, offset: String(page * PAGE) }),
      api('ui_facets', { ...params, loc_limit: LOC_LIMIT }),
    ]);
    if (key !== lastSearchKey) return;  // a newer search started meanwhile
    const total = facets.filter(f => f.facet === 'dataset').reduce((a, f) => a + f.n, 0);
    status.innerHTML = (s.pk ? `<p class="crumb"><a href="${esc(hrefFor({ pk: '', pl: '', page: '' }))}">${t('allPlaces')}</a>
      · ${t('personsAt')} <b>${esc(s.pl || s.pk)}</b></p>` : '') + esc(total ? (pair ? t('pairResults') : t('results'))(total) : t('noResults'));
    renderList(rows.slice(0, PAGE));
    renderPager(page, rows.length > PAGE, total);
    renderFacets(facets, s);
  } catch (err) {
    if (key !== lastSearchKey) return;
    status.className = 'status error';
    status.textContent = t('error') + err.message;
    $('#list').innerHTML = ''; $('#pager').innerHTML = '';
  }
}

async function renderPlaceList(s, status, key) {
  const words = plain(s.q).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) { status.textContent = ''; return; }
  status.textContent = t('loading');
  try {
    const rows = await api('ui_places', { w1: words[0], w2: words[1] || '', w3: words[2] || '' });
    if (key !== lastSearchKey) return;
    status.textContent = rows.length ? t('placesFound')(rows.length) + (rows.length >= 200 ? ' ' + t('placesMore') : '')
                                     : t('noResults');
    $('#list').innerHTML = rows.map(r => `
      <li class="card place-card">
        <span class="name"><a href="${esc(hrefFor({ pk: r.place_norm, pl: r.label, page: '' }))}">${esc(r.label)}</a></span>
        <span class="year">${esc(t('records')(r.records))}</span>
        <span class="meta">${(r.datasets || '').split(',').map(ds =>
          `<span class="badge${isRestricted(ds) ? ' restricted' : ''}">${esc(dsLabel(ds))}</span>`).join('')}</span>
      </li>`).join('');
  } catch (err) {
    if (key !== lastSearchKey) return;
    status.className = 'status error';
    status.textContent = t('error') + err.message;
  }
}

function renderList(rows) {
  $('#list').innerHTML = rows.map(r => {
    const group = (COLLECTIONS[r.collection] || {})[lang];
    // in the migration registers the "place" column holds the ship's name
    const place = r.place && r.place !== r.plantation
      ? (r.source_dataset === '12-migratie-datasets' ? `${t('ship')} ${r.place}` : r.place) : '';
    return `
    <li class="card">
      <span class="name"><a href="${esc(personHref(r.obs_key, r.person_id))}">${esc(r.full_name || '—')}</a></span>
      <span class="year">${esc(r.year || '')}</span>
      <span class="meta">
        <span class="badge role">${esc(roleLabel(r.role))}</span>
        <span class="badge${isRestricted(r.source_dataset) ? ' restricted' : ''}">${esc(dsLabel(r.source_dataset))}${group ? ' · ' + esc(group) : ''}</span>
        ${r.record_type && !group && RECORD_TYPES[lang][r.record_type] && r.source_dataset === '13-civil' ? `<span>${esc(recordLabel(r.record_type))}</span>` : ''}
        ${r.plantation ? `<span>${esc(r.plantation)}</span>` : ''}
        ${place ? `<span>${esc(place)}</span>` : ''}
        ${r.occupation ? `<span>${esc(r.occupation)}</span>` : ''}
      </span>
      ${r.other_id ? `<span class="pairwith">+ ${t('with')} <a href="${esc(personHref(r.other_key, r.other_id))}">${esc(r.other_name || '—')}</a>
        <span class="badge role">${esc(roleLabel(r.other_role))}</span></span>` : ''}
    </li>`;
  }).join('');
}

function renderPager(page, hasMore, total) {
  const from = page * PAGE + 1;
  const to = Math.min(total, (page + 1) * PAGE);
  $('#pager').innerHTML = total > PAGE ? `
    <button type="button" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>${t('prev')}</button>
    <span class="status">${t('page')(from, to)}</span>
    <button type="button" data-page="${page + 1}" ${hasMore ? '' : 'disabled'}>${t('next')}</button>` : '';
}

function renderFacets(facets, s) {
  const by = name => facets.filter(f => f.facet === name);
  const list = (name, title, stateKey, label) => {
    const items = by(name).sort((a, b) => b.n - a.n);
    if (!items.length) return '';
    return `<h2>${title}</h2>` + items.map(f => {
      const on = s[stateKey] === String(f.value);
      return `<button type="button" class="facet${on ? ' on' : ''}" data-facet="${stateKey}" data-value="${esc(on ? '' : f.value)}">
        <span>${esc(label(f.value))}</span><span class="n">${f.n.toLocaleString()}</span></button>`;
    }).join('');
  };
  let html = list('dataset', t('facetDataset'), 'dataset', dsLabel);
  html += list('role', t('facetRole'), 'role', roleLabel);
  html += list('role2', t('facetRole2'), 'role2', roleLabel);
  const dec = by('decade').sort((a, b) => a.value - b.value);
  if (dec.length > 1) {
    const max = Math.max(...dec.map(d => d.n));
    html += `<h2>${t('facetDecade')}</h2><div class="decades">` + dec.map(d =>
      `<button type="button" title="${d.value}–${d.value + 9}: ${d.n.toLocaleString()}" data-decade="${d.value}"
        class="${s.from === String(d.value) && s.to === String(d.value + 9) ? 'on' : ''}"
        style="height:${Math.max(4, Math.round(d.n / max * 70))}px"></button>`).join('') +
      `</div><div class="decade-axis"><span>${dec[0].value}</span><span>${dec[dec.length - 1].value + 9}</span></div>`;
  }
  const locs = by('location').sort((a, b) => b.n - a.n);
  if (locs.length) {
    const shown = showAllLocations ? locs : locs.slice(0, 15);
    if (s.loc && !shown.some(f => f.value === s.loc)) {
      const cur = locs.find(f => f.value === s.loc);
      if (cur) shown.unshift(cur);
    }
    html += `<h2>${t('facetLocation')}</h2>` + shown.map(f => {
      const on = s.loc === f.value;
      return `<button type="button" class="facet${on ? ' on' : ''}" data-facet="loc" data-value="${esc(on ? '' : f.value)}"
        data-label="${esc(on ? '' : (f.label || f.value))}"><span>${esc(f.label || f.value)}</span><span class="n">${f.n.toLocaleString()}</span></button>`;
    }).join('');
    if (locs.length > 15) {
      html += `<button type="button" class="link-btn" data-toggle-locs>${showAllLocations ? t('showLess') : t('showAll')(locs.length)}</button>`;
    }
  } else if (s.loc) {
    html += `<h2>${t('facetLocation')}</h2><button type="button" class="facet on" data-facet="loc" data-value="" data-label="">
      <span>${esc(s.locl || s.loc)}</span><span class="n">×</span></button>`;
  }
  $('#facets').innerHTML = html;

  // keep the dropdowns in step with what the current results contain
  fillSelect('#f-dataset', by('dataset').map(f => f.value), s.dataset, dsLabel);
  fillSelect('#f-role', by('role').map(f => f.value), s.role, roleLabel);
  fillSelect('#f-role2', by('role2').length ? by('role2').map(f => f.value) : Object.keys(ROLES.nl), s.role2, roleLabel);
}

function fillSelect(sel, values, current, label) {
  const el = $(sel);
  const vals = [...new Set([...(current ? [current] : []), ...values])].filter(Boolean)
    .sort((a, b) => label(a).localeCompare(label(b)));
  el.innerHTML = `<option value="">${t('all')}</option>` +
    vals.map(v => `<option value="${esc(v)}">${esc(label(v))}</option>`).join('');
  el.value = current || '';
}

// ---------------------------------------------------------------------------
// Rendering: person card
// ---------------------------------------------------------------------------
let personStack = [];

// placeKeys (optional): a normalised place per field; the value then links to the place search
function kv(fields, obj, placeKeys) {
  const rows = fields.map((f, i) => [...f, placeKeys ? placeKeys[i] : null])
    .filter(([k]) => obj[k] !== null && obj[k] !== undefined && obj[k] !== '')
    .map(([k, nl, en, pk]) => {
      let v = obj[k];
      if (k === 'license' && obj.embargo) v += ' (embargo)';
      if (k === 'religion' && obj.collection === 'migration-hindostani') nl = 'Godsdienst of kaste', en = 'Religion or caste';
      const val = pk ? `<a href="${esc(hrefFor({ view: 'places', q: v, pk, pl: v, page: '', obs: '', person: '',
                          dataset: '', role: '', from: '', to: '', loc: '', locl: '' }))}">${esc(v)}</a>` : esc(v);
      return `<dt>${esc(lang === 'nl' ? nl : en)}</dt><dd>${val}</dd>`;
    });
  return rows.length ? `<dl class="kv">${rows.join('')}</dl>` : `<p class="empty">${t('none')}</p>`;
}

function personLink(id, name, key) {
  return `<a class="person" href="${esc(personHref(key, id))}">${esc(name || '—')}</a>`;
}

function relationLabel(r) {
  const base = (REL[lang][r.relation_type] || {})[r.direction] || r.relation_type;
  if (r.relation_type === 'parent-child' && r.direction === 'in' && PARENT_DETAIL[lang][r.detail]) {
    return PARENT_DETAIL[lang][r.detail];
  }
  return base;
}

async function renderPerson(ref) {
  const drawer = $('#drawer');
  drawer.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#back').hidden = personStack.length < 2;
  const box = $('#detail');
  box.innerHTML = `<p class="status">${t('loading')}</p>`;
  try {
    const [p] = await api('ui_person', ref.key ? { key: ref.key } : { id: ref.id });
    if (!p) { box.innerHTML = `<p class="empty">${t('none')}</p>`; return; }
    const id = p.person_id;
    const [onRecord, rels, names, notes, same, places] = await Promise.all([
      p.certificate_id ? api('ui_record_persons', { cert: p.certificate_id }) : [],
      api('ui_relations', { id }),
      api('ui_names', { id }),
      p.certificate_id ? api('ui_notes', { cert: p.certificate_id }) : [],
      api('ui_same_name', { id }),
      p.certificate_id ? api('ui_record_places', { cert: p.certificate_id }) : [],
    ]);
    const links = archiveLinks(p);
    const photos = notes.filter(n => n.status === 'photo_url' && /^https:\/\//.test(n.text || ''));
    notes.filter(n => SCAN_NOTES[n.status] && /^https?:\/\//.test(n.text || ''))
      .forEach(n => links.push([SCAN_NOTES[n.status], n.text]));
    const otherNotes = notes.filter(n => n.status !== 'photo_url' && !SCAN_NOTES[n.status]);
    const sameRels = rels.filter(r => r.relation_type === 'same-person');
    const relsByOther = new Map();
    rels.forEach(r => { if (!relsByOther.has(r.other_id)) relsByOther.set(r.other_id, []); relsByOther.get(r.other_id).push(r); });
    // relations to people on the same record are shown in that list; the rest separately
    const recordIds = new Set(onRecord.map(o => o.person_id));
    const otherRels = rels.filter(r => !recordIds.has(r.other_id) && r.relation_type !== 'same-person');
    const confLabel = c => c === 'possible' ? t('possible') : (c && c !== 'certain' ? t('probable') : '');

    box.innerHTML = `
      <h2 id="d-title">${esc(p.full_name || '—')}</h2>
      <div class="meta">
        <span class="badge role">${esc(roleLabel(p.role))}</span>
        <span class="badge${isRestricted(p.source_dataset) ? ' restricted' : ''}">${esc(dsLabel(p.source_dataset))}</span>
        ${p.event_year ? `<span class="badge role">${esc(p.event_year)}</span>` : ''}
      </div>
      ${p.obs_key ? `<div class="permalink">${t('permalink')}: <code>${esc(p.obs_key)}</code>
        <button type="button" class="link-btn" data-copy="${esc(location.origin + location.pathname + '#obs=' + encodeURIComponent(p.obs_key))}">${t('copy')}</button></div>` : ''}
      ${isRestricted(p.source_dataset) ? `<div class="notice restricted">${t('restricted')}</div>` : ''}
      ${photos.length ? photos.map(n => `
        <a class="photo" href="${esc(n.text)}" target="_blank" rel="noopener"><img src="${esc(n.text)}" alt="${esc(p.full_name || '')}" loading="lazy"></a>`).join('') : ''}


      <h3>${t('person')}</h3>
      ${kv(PERSON_FIELDS, p)}

      <h3>${t('record')}</h3>
      ${kv(RECORD_FIELDS, { ...p, record_type: recordLabel(p.record_type),
                            collection: (COLLECTIONS[p.collection] || {})[lang] || p.collection })}
      ${links.length ? `<p class="links">${t('links')}: ` +
        links.map(([label, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join('') + '</p>' : ''}

      ${onRecord.length > 1 ? `<h3>${t('onRecord')}</h3><ul class="people">` + onRecord.map(o => {
        const me = o.person_id === p.person_id;
        const how = (relsByOther.get(o.person_id) || []).map(relationLabel);
        return `<li class="${me ? 'me' : ''}">
          <span class="rel">${esc(roleLabel(o.role))}${o.role_index ? ' ' + esc(o.role_index) : ''}</span>
          ${me ? `<b>${esc(o.full_name || '—')}</b> <span class="small">${t('you')}</span>` : personLink(o.person_id, o.full_name, o.obs_key)}
          ${how.length ? `<span class="small">→ ${esc([...new Set(how)].join(', '))}</span>` : ''}
          ${o.age ? `<span class="small">${esc(o.age)}</span>` : ''}
          ${o.occupation ? `<span class="small">${esc(o.occupation)}</span>` : ''}
        </li>`;
      }).join('') + '</ul>' : ''}

      ${sameRels.length ? `<h3>${t('samePerson')}</h3><ul class="people">` + sameRels.map(r => `
        <li><span class="rel">${esc(confLabel(r.confidence) || '')}</span>
          ${personLink(r.other_id, r.other_name, r.other_key)}
          <span class="badge${isRestricted(r.other_dataset) ? ' restricted' : ''}">${esc(dsLabel(r.other_dataset))}</span>
          <span class="small">${r.other_year ? esc(r.other_year) + ', ' : ''}${esc(r.detail || '')}</span>
        </li>`).join('') + '</ul>' : ''}

      ${places.length ? `<h3>${t('recordPlaces')}</h3>` + kv(places.map((pl, i) => [`pl${i}`, placeFieldLabel(pl.field_origin), placeFieldLabel(pl.field_origin)]),
        Object.fromEntries(places.map((pl, i) => [`pl${i}`, pl.raw_text])), places.map(pl => pl.location_norm)) : ''}

      ${otherRels.length ? `<h3>${t('relations')}</h3><ul class="people">` + otherRels.map(r => `
        <li><span class="rel">${esc(relationLabel(r))}${confLabel(r.confidence) ? ` (${confLabel(r.confidence)})` : ''}</span>
          ${personLink(r.other_id, r.other_name, r.other_key)}
          <span class="small">${esc(dsLabel(r.other_dataset))}${r.other_year ? ', ' + esc(r.other_year) : ''}</span>
          ${r.detail && r.detail !== r.relation_type ? `<span class="small">“${esc(r.detail)}”</span>` : ''}
        </li>`).join('') + '</ul>' : ''}

      ${names.length ? `<h3>${t('otherNames')}</h3>` + kv(names.map((n, i) => [`n${i}`, NAME_KINDS.nl[n.kind] || n.kind, NAME_KINDS.en[n.kind] || n.kind]),
        Object.fromEntries(names.map((n, i) => [`n${i}`, n.value]))) : ''}

      ${otherNotes.length ? `<h3>${t('notes')}</h3>` + otherNotes.map(n => `
        <div class="note">${n.status ? `<b>${esc((NOTE_KINDS[lang] || {})[n.status] || n.status)}</b>` : ''}${esc(n.text)}</div>`).join('') : ''}

      <h3>${t('sameName')}</h3>
      ${same.length ? '<ul class="people">' + same.map(o => `
        <li><span class="rel">${esc(roleLabel(o.role))}</span>
          ${personLink(o.person_id, o.full_name, o.obs_key)}
          <span class="badge${isRestricted(o.source_dataset) ? ' restricted' : ''}">${esc(dsLabel(o.source_dataset))}</span>
          <span class="small">${[o.year, o.place].filter(Boolean).map(esc).join(', ')}</span>
          ${o.via && o.via !== 'name' ? `<span class="small">(${esc(T[lang].via[o.via] || o.via)})</span>` : ''}
        </li>`).join('') + '</ul>' : `<p class="empty">${t('none')}</p>`}
    `;
    $('.drawer-panel').scrollTop = 0;
  } catch (err) {
    box.innerHTML = `<p class="status error">${esc(t('error') + err.message)}</p>`;
  }
}

function closePerson() {
  personStack = [];
  $('#drawer').hidden = true;
  document.body.style.overflow = '';
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-tp]').forEach(el => { el.placeholder = t(el.dataset.tp); });
  document.title = t('title');
  $('#lang').textContent = lang === 'nl' ? 'EN' : 'NL';
}

function syncForm(s) {
  document.body.classList.toggle('view-places', s.view === 'places');
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('on', b.dataset.view === s.view));
  $('#q').placeholder = t(s.view === 'places' ? 'placesPh' : 'placeholder');
  $('#q').value = s.q;
  $('#f-mode').value = s.mode;
  $('#q2').value = s.q2;
  if (s.q2) $('#pair').hidden = false;
  $('#pair-btn').hidden = !$('#pair').hidden;
  if (!$('#f-role2').querySelector(`option[value="${CSS.escape(s.role2)}"]`)) fillSelect('#f-role2', Object.keys(ROLES.nl), s.role2, roleLabel);
  $('#f-role2').value = s.role2;
  $('#f-from').value = s.from;
  $('#f-to').value = s.to;
  $('#f-place').value = s.place;
  $('#f-sort').value = s.sort;
  if (!$('#f-dataset').querySelector(`option[value="${CSS.escape(s.dataset)}"]`)) fillSelect('#f-dataset', [], s.dataset, dsLabel);
  $('#f-dataset').value = s.dataset;
  if (!$('#f-role').querySelector(`option[value="${CSS.escape(s.role)}"]`)) fillSelect('#f-role', [], s.role, roleLabel);
  $('#f-role').value = s.role;
}

function render() {
  const s = readState();
  syncForm(s);
  renderSearch(s);
  const ref = s.obs ? { key: s.obs } : (s.person ? { id: s.person } : null);
  if (ref) {
    const tag = s.obs || 'id:' + s.person;
    if (personStack[personStack.length - 1] !== tag) {
      const i = personStack.indexOf(tag);
      personStack = i >= 0 ? personStack.slice(0, i + 1) : [...personStack, tag];
    }
    renderPerson(ref);
  } else {
    closePerson();
  }
}

function formState() {
  const s = readState();
  const q = $('#q').value.trim();
  return {
    view: s.view, q, q2: $('#q2').value.trim(), role2: $('#f-role2').value, mode: $('#f-mode').value, dataset: $('#f-dataset').value, role: $('#f-role').value,
    from: $('#f-from').value, to: $('#f-to').value, place: $('#f-place').value.trim(),
    sort: $('#f-sort').value, page: '', obs: '', person: '',
    // a new place search leaves the chosen place
    pk: s.view === 'places' && q !== s.q ? '' : s.pk, pl: s.view === 'places' && q !== s.q ? '' : s.pl,
  };
}

$('#search').addEventListener('submit', e => { e.preventDefault(); writeState(formState()); });
['#f-mode', '#f-dataset', '#f-role', '#f-role2', '#f-sort'].forEach(sel => $(sel).addEventListener('change', () => writeState(formState())));
$('#reset').addEventListener('click', () => { const s = readState(); writeState({ view: s.view, q: s.q, mode: s.mode, pk: s.pk, pl: s.pl }); });
$('#pair-btn').addEventListener('click', () => { $('#pair').hidden = false; $('#pair-btn').hidden = true; $('#q2').focus(); });
$('#pair-clear').addEventListener('click', () => { $('#pair').hidden = true; $('#pair-btn').hidden = false; setState({ q2: '', role2: '', page: '' }); });
$('#help-btn').addEventListener('click', () => {
  const box = $('#help');
  box.hidden = !box.hidden;
  box.innerHTML = t('helpHtml');
  $('#help-btn').setAttribute('aria-expanded', String(!box.hidden));
});
$('#lang').addEventListener('click', () => {
  lang = lang === 'nl' ? 'en' : 'nl';
  try { localStorage.setItem('stm-lang', lang); } catch (e) { /* storage unavailable */ }
  applyLang(); lastSearchKey = null; render();
});

document.addEventListener('click', e => {
  // In-page links: let the browser handle new-tab clicks; otherwise update state without a reload.
  const link = e.target.closest('a[href^="#"]');
  if (link) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    history.pushState(null, '', link.getAttribute('href'));
    render();
    return;
  }
  const view = e.target.closest('[data-view]');
  if (view) { const s = readState(); writeState({ view: view.dataset.view, q: s.q, mode: s.mode }); return; }
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    navigator.clipboard?.writeText(copy.dataset.copy).then(() => { copy.textContent = t('copied'); }).catch(() => {});
    return;
  }
  const facet = e.target.closest('[data-facet]');
  if (facet) {
    const patch = { [facet.dataset.facet]: facet.dataset.value, page: '', person: '', obs: '' };
    if (facet.dataset.facet === 'loc') patch.locl = facet.dataset.label;
    setState(patch);
    return;
  }
  if (e.target.closest('[data-toggle-locs]')) {
    showAllLocations = !showAllLocations;
    lastSearchKey = null;
    render();
    return;
  }
  const decade = e.target.closest('[data-decade]');
  if (decade) {
    const d = parseInt(decade.dataset.decade, 10);
    const s = readState();
    const on = s.from === String(d) && s.to === String(d + 9);
    setState({ from: on ? '' : String(d), to: on ? '' : String(d + 9), page: '', person: '', obs: '' });
    return;
  }
  const pageBtn = e.target.closest('[data-page]');
  if (pageBtn && !pageBtn.disabled) { setState({ page: pageBtn.dataset.page === '0' ? '' : pageBtn.dataset.page }); window.scrollTo(0, 0); return; }
  if (e.target.closest('[data-close]')) { setState({ person: '', obs: '' }); return; }
  if (e.target.closest('#back')) { history.back(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#drawer').hidden) setState({ person: '', obs: '' });
});
window.addEventListener('popstate', render);

applyLang();
render();
