import Link from 'next/link';

const STATS = [
  { label: 'Plantations', value: '1,596', desc: 'E25 Human-Made Features' },
  { label: 'Organizations', value: '934', desc: 'E74 with Wikidata Q-IDs' },
  { label: 'Observations', value: '22,999', desc: 'Annual almanac records' },
  { label: 'Name Variants', value: '7,062', desc: 'E41 Appellations' },
  { label: 'Sources', value: '30', desc: 'Maps, almanacs, registers' },
  { label: 'Provenance Records', value: '4,154', desc: 'Full audit trails' },
];

const PARTNERS = [
  'Huygens Instituut (KNAW)',
  'Nationaal Archief Suriname',
  'Nationaal Archief Nederland',
  'Stichting Surinaamse Genealogie',
  'Historische Database Suriname en de Cariben (HDSC)',
  'Amsterdam Time Machine, UvA',
  'Wikimedia Nederland',
];

export default function HomePage() {
  return (
    <div className="h-full overflow-y-auto">
      {/* Hero */}
      <section className="relative bg-stm-warm-900 text-white overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-stm-warm-900 via-stm-warm-800 to-stm-sepia-900 opacity-95" />
        <div className="relative max-w-5xl mx-auto px-6 py-20 sm:py-28 lg:py-32">
          <p className="text-stm-sepia-300 text-sm font-medium uppercase tracking-widest mb-4">
            Linked Open Data for Colonial Archives
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6 text-stm-sepia-100">
            De Suriname Tijdmachine brengt verspreide historische bronnen samen
          </h1>
          <p className="text-stm-warm-300 text-lg sm:text-xl max-w-3xl leading-relaxed mb-10">
            Explore 1,596 historical plantations across Suriname through
            CIDOC-CRM modeled linked data. Connect maps, almanacs, and
            emancipation registers into a unified knowledge graph.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/explore"
              className="inline-flex items-center justify-center px-6 py-3 bg-stm-sepia-500 hover:bg-stm-sepia-400 text-white font-semibold transition-colors text-sm"
            >
              Explore the Map
              <svg
                className="ml-2 w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </Link>
            <Link
              href="/model"
              className="inline-flex items-center justify-center px-6 py-3 border border-stm-warm-600 hover:border-stm-warm-400 text-stm-warm-200 hover:text-white font-semibold transition-colors text-sm"
            >
              Browse Data Model
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 sm:py-20 bg-white border-b border-stm-warm-200">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-stm-warm-800 mb-2">
            Database at a Glance
          </h2>
          <p className="text-stm-warm-500 mb-10 max-w-2xl">
            The dataset spans 38,000+ entities modeled with CIDOC-CRM, linking
            physical plantations to their operators, locations, and historical
            sources.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            {STATS.map(({ label, value, desc }) => (
              <div
                key={label}
                className="bg-stm-warm-50 border border-stm-warm-200 p-5"
              >
                <p className="text-3xl font-bold text-stm-sepia-600 font-serif">
                  {value}
                </p>
                <p className="text-sm font-semibold text-stm-warm-700 mt-1">
                  {label}
                </p>
                <p className="text-xs text-stm-warm-400 mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-20 bg-stm-warm-50">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-stm-warm-800 mb-10">
            Universal Source Pattern
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="bg-white border border-stm-warm-200 p-6">
              <div className="w-10 h-10 bg-blue-50 flex items-center justify-center mb-4">
                <span className="text-entity-e25 font-bold text-sm">E25</span>
              </div>
              <h3 className="font-semibold text-stm-warm-800 mb-2">
                Plantation (Physical Site)
              </h3>
              <p className="text-sm text-stm-warm-500 leading-relaxed">
                The central entity. Maps depict plantations; plantations have
                locations. Connected to E53 Place via P53, to E74 Organization
                via P52.
              </p>
            </div>
            <div className="bg-white border border-stm-warm-200 p-6">
              <div className="w-10 h-10 bg-purple-50 flex items-center justify-center mb-4">
                <span className="text-entity-e74 font-bold text-sm">E74</span>
              </div>
              <h3 className="font-semibold text-stm-warm-800 mb-2">
                Organization (Legal Entity)
              </h3>
              <p className="text-sm text-stm-warm-500 leading-relaxed">
                Who owns or operates the plantation. Identified by Wikidata
                Q-IDs. Linked to annual observations from the Surinaamse
                Almanakken.
              </p>
            </div>
            <div className="bg-white border border-stm-warm-200 p-6">
              <div className="w-10 h-10 bg-green-50 flex items-center justify-center mb-4">
                <span className="text-entity-e53 font-bold text-sm">E53</span>
              </div>
              <h3 className="font-semibold text-stm-warm-800 mb-2">
                Place (Location / Geometry)
              </h3>
              <p className="text-sm text-stm-warm-500 leading-relaxed">
                Where the plantation is. Polygons from the 1930 QGIS map,
                reprojected from EPSG:31170 to WGS84. Linked to E25 via P53.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Partners */}
      <section className="py-16 sm:py-20 bg-white border-t border-stm-warm-200">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-stm-warm-800 mb-8">
            Partners
          </h2>
          <div className="flex flex-wrap gap-3">
            {PARTNERS.map((name) => (
              <span
                key={name}
                className="bg-stm-warm-100 text-stm-warm-600 px-4 py-2 text-sm font-medium"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-stm-warm-900 text-stm-warm-400 py-10">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row justify-between gap-6">
          <div>
            <p className="font-serif text-stm-sepia-300 font-bold mb-1">
              Suriname Time Machine
            </p>
            <p className="text-sm">LivesLab, Huygens Instituut (KNAW)</p>
            <p className="text-xs mt-2">
              Linked Open Data &middot; CIDOC-CRM &middot; PICO Model
            </p>
          </div>
          <div className="text-sm space-y-1">
            <a
              href="https://surinametijdmachine.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:text-stm-sepia-300 transition-colors"
            >
              surinametijdmachine.org
            </a>
            <a
              href="https://www.huygens.knaw.nl/en/projecten/suriname-time-machine/"
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:text-stm-sepia-300 transition-colors"
            >
              Huygens Project Page
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
