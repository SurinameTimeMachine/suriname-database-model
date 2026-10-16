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
    facetDataset: 'Bron', facetRole: 'Rol', facetDecade: 'Periode', facetPlantation: 'Plantage (top 15)',
    person: 'Persoon', record: 'Bron / akte', onRecord: 'Op dezelfde akte / hetzelfde record',
    relations: 'Relaties', otherNames: 'Andere namen en herkomst', notes: 'Opmerkingen en aantekeningen',
    sameName: 'Zelfde naam elders – mogelijk dezelfde persoon (niet automatisch gekoppeld)',
    links: 'Bekijken bij het archief', none: 'Geen.', you: '(deze persoon)', probable: 'waarschijnlijk',
    via: { name: 'zelfde naam', emancipation_name: 'via emancipatienaam', former_name: 'via eerdere naam',
           orig_spelling: 'via oorspronkelijke spelling', maiden_name: 'via meisjesnaam',
           widow_name: 'via weduwenaam', baptized_name: 'via doopnaam', display_name: 'via weergavenaam' },
    restricted: 'Beperkte bron: alleen voor intern gebruik door het projectteam. Niet delen of publiceren.',
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
    facetDataset: 'Source', facetRole: 'Role', facetDecade: 'Period', facetPlantation: 'Plantation (top 15)',
    person: 'Person', record: 'Source / record', onRecord: 'On the same record',
    relations: 'Relations', otherNames: 'Other names and origin', notes: 'Remarks and notes',
    sameName: 'Same name elsewhere – possibly the same person (not linked automatically)',
    links: 'View at the archive', none: 'None.', you: '(this person)', probable: 'probable',
    via: { name: 'same name', emancipation_name: 'via emancipation name', former_name: 'via former name',
           orig_spelling: 'via original spelling', maiden_name: 'via maiden name',
           widow_name: 'via widow name', baptized_name: 'via baptismal name', display_name: 'via display name' },
    restricted: 'Restricted source: internal use by the project team only. Do not share or publish.',
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
    related: { out: 'verwant', in: 'verwant' },
  },
  en: {
    'parent-child': { out: 'child', in: 'parent' }, spouse: { out: 'spouse', in: 'spouse' },
    sibling: { out: 'sibling', in: 'sibling' }, foster: { out: 'foster child', in: 'foster parent' },
    witness: { out: 'witness on record of', in: 'witness' }, declarant: { out: 'declarant for', in: 'declarant' },
    informant: { out: 'reported the event of', in: 'informant' },
    'enslaver-enslaved': { out: 'enslaved', in: 'owner' },
    'employer-plantation': { out: 'plantation', in: 'employer' }, 'owner-property': { out: 'property', in: 'owner' },
    related: { out: 'relative', in: 'relative' },
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

// "maria elis" -> "maria"* "elis"*  (all words, any order, each as a prefix)
function ftsMatch(q) {
  return q.trim().split(/\s+/).filter(Boolean)
    .map(w => '"' + w.replace(/"/g, '""') + '"*').join(' ');
}

// ---------------------------------------------------------------------------
// State in the URL hash
// ---------------------------------------------------------------------------
const KEYS = ['q', 'dataset', 'role', 'from', 'to', 'place', 'sort', 'page', 'person'];
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

// ---------------------------------------------------------------------------
// Rendering: search results and facets
// ---------------------------------------------------------------------------
let lastSearchKey = null;

function filterParams(s) {
  return { match: ftsMatch(s.q), dataset: s.dataset, role: s.role, year_from: s.from, year_to: s.to, place: s.place };
}

async function renderSearch(s) {
  const key = JSON.stringify([s.q, s.dataset, s.role, s.from, s.to, s.place, s.sort, s.page, lang]);
  if (key === lastSearchKey) return;
  lastSearchKey = key;
  const status = $('#status');
  status.className = 'status';
  $('#intro').innerHTML = s.q ? '' : t('introHtml');
  if (!s.q.trim()) {
    status.textContent = ''; $('#list').innerHTML = ''; $('#pager').innerHTML = ''; $('#facets').innerHTML = '';
    return;
  }
  status.textContent = t('loading');
  const page = Math.max(0, parseInt(s.page || '0', 10) || 0);
  try {
    const params = filterParams(s);
    const [rows, facets] = await Promise.all([
      api('ui_search', { ...params, sort: s.sort, offset: String(page * PAGE) }),
      api('ui_facets', params),
    ]);
    if (key !== lastSearchKey) return;  // a newer search started meanwhile
    const total = facets.filter(f => f.facet === 'dataset').reduce((a, f) => a + f.n, 0);
    status.textContent = total ? t('results')(total) : t('noResults');
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

function renderList(rows) {
  $('#list').innerHTML = rows.map(r => {
    const group = (COLLECTIONS[r.collection] || {})[lang];
    // in the migration registers the "place" column holds the ship's name
    const place = r.place && r.place !== r.plantation
      ? (r.source_dataset === '12-migratie-datasets' ? `${t('ship')} ${r.place}` : r.place) : '';
    return `
    <li class="card" tabindex="0" data-person="${r.person_id}">
      <span class="name">${esc(r.full_name || '—')}</span>
      <span class="year">${esc(r.year || '')}</span>
      <span class="meta">
        <span class="badge role">${esc(roleLabel(r.role))}</span>
        <span class="badge${isRestricted(r.source_dataset) ? ' restricted' : ''}">${esc(dsLabel(r.source_dataset))}${group ? ' · ' + esc(group) : ''}</span>
        ${r.record_type && !group && RECORD_TYPES[lang][r.record_type] && r.source_dataset === '13-civil' ? `<span>${esc(recordLabel(r.record_type))}</span>` : ''}
        ${r.plantation ? `<span>${esc(r.plantation)}</span>` : ''}
        ${place ? `<span>${esc(place)}</span>` : ''}
        ${r.occupation ? `<span>${esc(r.occupation)}</span>` : ''}
      </span>
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
  const dec = by('decade').sort((a, b) => a.value - b.value);
  if (dec.length > 1) {
    const max = Math.max(...dec.map(d => d.n));
    html += `<h2>${t('facetDecade')}</h2><div class="decades">` + dec.map(d =>
      `<button type="button" title="${d.value}–${d.value + 9}: ${d.n.toLocaleString()}" data-decade="${d.value}"
        class="${s.from === String(d.value) && s.to === String(d.value + 9) ? 'on' : ''}"
        style="height:${Math.max(4, Math.round(d.n / max * 70))}px"></button>`).join('') +
      `</div><div class="decade-axis"><span>${dec[0].value}</span><span>${dec[dec.length - 1].value + 9}</span></div>`;
  }
  html += list('plantation', t('facetPlantation'), 'place', v => v);
  $('#facets').innerHTML = html;

  // keep the dropdowns in step with what the current results contain
  fillSelect('#f-dataset', by('dataset').map(f => f.value), s.dataset, dsLabel);
  fillSelect('#f-role', by('role').map(f => f.value), s.role, roleLabel);
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

function kv(fields, obj) {
  const rows = fields.filter(([k]) => obj[k] !== null && obj[k] !== undefined && obj[k] !== '')
    .map(([k, nl, en]) => {
      let v = obj[k];
      if (k === 'license' && obj.embargo) v += ' (embargo)';
      return `<dt>${esc(lang === 'nl' ? nl : en)}</dt><dd>${esc(v)}</dd>`;
    });
  return rows.length ? `<dl class="kv">${rows.join('')}</dl>` : `<p class="empty">${t('none')}</p>`;
}

function personLink(id, name) {
  return `<button type="button" class="person" data-person="${id}">${esc(name || '—')}</button>`;
}

function relationLabel(r) {
  const base = (REL[lang][r.relation_type] || {})[r.direction] || r.relation_type;
  if (r.relation_type === 'parent-child' && r.direction === 'in' && PARENT_DETAIL[lang][r.detail]) {
    return PARENT_DETAIL[lang][r.detail];
  }
  return base;
}

async function renderPerson(id) {
  const drawer = $('#drawer');
  drawer.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#back').hidden = personStack.length < 2;
  const box = $('#detail');
  box.innerHTML = `<p class="status">${t('loading')}</p>`;
  try {
    const [p] = await api('ui_person', { id });
    if (!p) { box.innerHTML = `<p class="empty">${t('none')}</p>`; return; }
    const [onRecord, rels, names, notes, same] = await Promise.all([
      p.certificate_id ? api('ui_record_persons', { cert: p.certificate_id }) : [],
      api('ui_relations', { id }),
      api('ui_names', { id }),
      p.certificate_id ? api('ui_notes', { cert: p.certificate_id }) : [],
      api('ui_same_name', { id }),
    ]);
    const links = archiveLinks(p);
    const photos = notes.filter(n => n.status === 'photo_url' && /^https:\/\//.test(n.text || ''));
    const otherNotes = notes.filter(n => n.status !== 'photo_url');
    const relsByOther = new Map();
    rels.forEach(r => { if (!relsByOther.has(r.other_id)) relsByOther.set(r.other_id, []); relsByOther.get(r.other_id).push(r); });
    // relations to people on the same record are shown in that list; the rest separately
    const recordIds = new Set(onRecord.map(o => o.person_id));
    const otherRels = rels.filter(r => !recordIds.has(r.other_id));

    box.innerHTML = `
      <h2 id="d-title">${esc(p.full_name || '—')}</h2>
      <div class="meta">
        <span class="badge role">${esc(roleLabel(p.role))}</span>
        <span class="badge${isRestricted(p.source_dataset) ? ' restricted' : ''}">${esc(dsLabel(p.source_dataset))}</span>
        ${p.event_year ? `<span class="badge role">${esc(p.event_year)}</span>` : ''}
      </div>
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
          ${me ? `<b>${esc(o.full_name || '—')}</b> <span class="small">${t('you')}</span>` : personLink(o.person_id, o.full_name)}
          ${how.length ? `<span class="small">→ ${esc([...new Set(how)].join(', '))}</span>` : ''}
          ${o.age ? `<span class="small">${esc(o.age)}</span>` : ''}
          ${o.occupation ? `<span class="small">${esc(o.occupation)}</span>` : ''}
        </li>`;
      }).join('') + '</ul>' : ''}

      ${otherRels.length ? `<h3>${t('relations')}</h3><ul class="people">` + otherRels.map(r => `
        <li><span class="rel">${esc(relationLabel(r))}${r.confidence && r.confidence !== 'certain' ? ` (${t('probable')})` : ''}</span>
          ${personLink(r.other_id, r.other_name)}
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
          ${personLink(o.person_id, o.full_name)}
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
  $('#q').value = s.q;
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
  if (s.person) {
    if (personStack[personStack.length - 1] !== s.person) {
      const i = personStack.indexOf(s.person);
      personStack = i >= 0 ? personStack.slice(0, i + 1) : [...personStack, s.person];
    }
    renderPerson(s.person);
  } else {
    closePerson();
  }
}

function formState() {
  return {
    q: $('#q').value.trim(), dataset: $('#f-dataset').value, role: $('#f-role').value,
    from: $('#f-from').value, to: $('#f-to').value, place: $('#f-place').value.trim(),
    sort: $('#f-sort').value, page: '', person: '',
  };
}

$('#search').addEventListener('submit', e => { e.preventDefault(); writeState(formState()); });
['#f-dataset', '#f-role', '#f-sort'].forEach(sel => $(sel).addEventListener('change', () => writeState(formState())));
$('#reset').addEventListener('click', () => writeState({ q: $('#q').value.trim() }));
$('#lang').addEventListener('click', () => {
  lang = lang === 'nl' ? 'en' : 'nl';
  try { localStorage.setItem('stm-lang', lang); } catch (e) { /* storage unavailable */ }
  applyLang(); lastSearchKey = null; render();
});

document.addEventListener('click', e => {
  const person = e.target.closest('[data-person]');
  if (person) { setState({ person: person.dataset.person }); return; }
  const facet = e.target.closest('[data-facet]');
  if (facet) { setState({ [facet.dataset.facet]: facet.dataset.value, page: '', person: '' }); return; }
  const decade = e.target.closest('[data-decade]');
  if (decade) {
    const d = parseInt(decade.dataset.decade, 10);
    const s = readState();
    const on = s.from === String(d) && s.to === String(d + 9);
    setState({ from: on ? '' : String(d), to: on ? '' : String(d + 9), page: '', person: '' });
    return;
  }
  const pageBtn = e.target.closest('[data-page]');
  if (pageBtn && !pageBtn.disabled) { setState({ page: pageBtn.dataset.page === '0' ? '' : pageBtn.dataset.page }); window.scrollTo(0, 0); return; }
  if (e.target.closest('[data-close]')) { setState({ person: '' }); return; }
  if (e.target.closest('#back')) { history.back(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#drawer').hidden) setState({ person: '' });
  if (e.key === 'Enter' && e.target.matches('.card')) setState({ person: e.target.dataset.person });
});
window.addEventListener('popstate', render);

applyLang();
render();
