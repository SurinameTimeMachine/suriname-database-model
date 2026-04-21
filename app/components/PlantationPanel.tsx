'use client';

import type { AllData } from '@/lib/data';
import {
  CRM_CLASS_NAMES,
  CRM_COLORS,
  entityTypeColor,
  uriLabel,
} from '@/lib/data';
import { usePlaceTypes } from '@/lib/thesaurus';
import type {
  E22Source,
  E25Plantation,
  E41Appellation,
  E53Place,
  E74Organization,
  GeoJSONFeature,
  OrganizationObservation,
  ProvenanceRecord,
} from '@/lib/types';
import { extractPlaceId } from '@/lib/url';
import Link from 'next/link';
import { useRef, useState } from 'react';
import EntityGraph from './EntityGraph';
import ProvenanceChain from './ProvenanceChain';

interface PlantationPanelProps {
  feature: GeoJSONFeature | null;
  data: AllData | null;
  onClose: () => void;
}

function Badge({ type }: { type: string }) {
  const fullName = CRM_CLASS_NAMES[type] || type;
  const lightBgTypes = [
    'E41',
    'E39',
    'E55',
    'E52',
    'E54',
    'PROV',
    'Provenance',
  ];
  return (
    <span
      className="inline-block px-1.5 py-0.5 text-[10px] font-bold mr-1.5 uppercase tracking-wide"
      style={{
        backgroundColor: CRM_COLORS[type] || entityTypeColor(type),
        color: lightBgTypes.includes(type) ? '#78716c' : '#fff',
      }}
      title={fullName}
    >
      {type}
    </span>
  );
}

function SectionHeader({
  id,
  title,
  badge,
  open,
  onToggle,
  refs,
  count,
}: {
  id: string;
  title: string;
  badge: string;
  open: boolean;
  onToggle: () => void;
  refs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  count?: number;
}) {
  return (
    <div
      ref={(el) => {
        refs.current[id] = el;
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2 px-3 text-left hover:bg-stm-warm-50/50 transition-colors"
        aria-expanded={open}
        aria-controls={`section-${id}`}
      >
        <span className="text-xs font-semibold text-stm-warm-700 flex items-center">
          <Badge type={badge} />
          {title}
          {count != null && (
            <span className="ml-1.5 text-stm-warm-400 font-normal">
              ({count})
            </span>
          )}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-stm-warm-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | number | boolean | null;
  mono?: boolean;
}) {
  if (value == null || value === '') return null;
  return (
    <div className="flex gap-2 text-xs leading-relaxed">
      <span className="text-stm-warm-400 min-w-18 shrink-0">{label}</span>
      <span
        className={`text-stm-warm-700 ${mono ? 'font-mono text-[11px]' : ''}`}
      >
        {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
      </span>
    </div>
  );
}

function WikidataLink({ qid }: { qid: string }) {
  const id = qid.includes('/') ? qid.split('/').pop()! : qid;
  return (
    <a
      href={`https://www.wikidata.org/wiki/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-stm-teal-600 hover:underline font-mono"
    >
      {id}
    </a>
  );
}

function CrmField({
  label,
  crmClass,
  property,
  value,
  mono,
  children,
}: {
  label: string;
  crmClass: string;
  property?: string;
  value?: string | number | boolean | null;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  const hasValue = children != null || (value != null && value !== '');
  const color = CRM_COLORS[crmClass] || '#6b7280';
  return (
    <div className="flex items-start gap-2 text-xs leading-relaxed py-0.5">
      <span
        className="inline-block w-1.5 h-1.5 shrink-0 mt-1.5"
        style={{ backgroundColor: color }}
        title={CRM_CLASS_NAMES[crmClass] || crmClass}
      />
      <span className="text-stm-warm-400 min-w-18 shrink-0">
        {label}
        {property && (
          <span className="block text-[9px] font-mono text-stm-warm-300">
            {property}
          </span>
        )}
      </span>
      {hasValue ? (
        <span
          className={`text-stm-warm-700 ${mono ? 'font-mono text-[11px]' : ''}`}
        >
          {children ||
            (typeof value === 'boolean'
              ? value
                ? 'Yes'
                : 'No'
              : String(value))}
        </span>
      ) : (
        <span className="text-stm-warm-300 italic">no data</span>
      )}
      <span className="ml-auto text-[9px] font-mono shrink-0" style={{ color }}>
        {crmClass}
      </span>
    </div>
  );
}

function AppellationRow({
  app,
  sourceLabel,
}: {
  app: E41Appellation;
  sourceLabel: string | null;
}) {
  return (
    <div className="border border-stm-warm-200 bg-white px-2 py-1 text-[11px]">
      <div className="text-stm-warm-800">{app.P190_has_symbolic_content}</div>
      <div className="mt-0.5 text-[10px] text-stm-warm-500 flex flex-wrap gap-x-2 gap-y-0.5">
        <span>lang: {app.P72_has_language || 'und'}</span>
        {sourceLabel && <span>source: {sourceLabel}</span>}
        {app.mapYear && <span>year: {app.mapYear}</span>}
      </div>
    </div>
  );
}

function TimelineEntry({
  obs,
  sourceLabel,
}: {
  obs: OrganizationObservation;
  sourceLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-l-2 border-stm-warm-200 hover:border-stm-teal-400 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left pl-3 pr-2 py-1 flex items-center gap-2 text-xs"
      >
        <span className="font-semibold text-stm-teal-700 tabular-nums shrink-0 w-8">
          {obs.observationYear}
        </span>
        <span className="text-stm-warm-600 truncate min-w-0">
          {obs.observedName}
        </span>
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          {obs.product && (
            <span className="bg-stm-teal-50 text-stm-teal-700 px-1.5 py-0.5 text-[10px]">
              {obs.product}
            </span>
          )}
          {obs.deserted && (
            <span className="bg-red-50 text-red-600 px-1.5 py-0.5 text-[10px]">
              verlaten
            </span>
          )}
          <svg
            className={`w-3 h-3 text-stm-warm-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="pl-3 pr-2 pb-2 pt-1 space-y-0">
          <p className="text-[9px] text-stm-warm-300 font-mono mb-1">
            E13 Attribute Assignment &mdash; P140 assigned to E74 &mdash; P4 has
            time-span E52 ({obs.observationYear})
          </p>
          <CrmField
            label="Name"
            crmClass="E41"
            property="P141 assigned"
            value={obs.observedName}
          />
          <CrmField
            label="Product"
            crmClass="E55"
            property="P141 assigned"
            value={obs.product}
          />
          <CrmField
            label="Owner"
            crmClass="E39"
            property="P14 carried out by"
            value={obs.hasOwner}
          />
          <CrmField
            label="Administrator"
            crmClass="E39"
            property="P14 carried out by"
            value={obs.hasAdministrator}
          />
          <CrmField
            label="Director"
            crmClass="E39"
            property="P14 carried out by"
            value={obs.hasDirector}
          />
          <CrmField
            label="Size"
            crmClass="E54"
            property="P43 has dimension"
            value={obs.sizeAkkers != null ? `${obs.sizeAkkers} akkers` : null}
          />
          <CrmField
            label="Location"
            crmClass="E53"
            property="P7 took place at"
            value={obs.locationStd}
          />
          <CrmField
            label="Deserted"
            crmClass="E17"
            property="P42 assigned"
            value={obs.deserted != null ? (obs.deserted ? 'Yes' : 'No') : null}
          />
          <CrmField
            label="Source"
            crmClass="E22"
            property="prov:hadPrimarySource"
            value={
              sourceLabel ||
              (obs.hadPrimarySource && uriLabel(obs.hadPrimarySource))
            }
          />
          <CrmField
            label="Page"
            crmClass="E22"
            property="P3 has note"
            value={obs.pageReference}
          />
        </div>
      )}
    </div>
  );
}

export default function PlantationPanel({
  feature,
  data,
  onClose,
}: PlantationPanelProps) {
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const {
    colors: PLACE_TYPE_COLORS,
    labels: PLACE_TYPE_LABELS,
    crmBadges: PLACE_TYPE_CRM_BADGE,
    biasTypes,
  } = usePlaceTypes();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    plantation: true,
    organization: true,
    place: true,
    sources: true,
    provenance: false,
  });

  if (!feature || !data) return null;

  const toggle = (id: string) =>
    setOpenSections((s) => ({ ...s, [id]: !s[id] }));

  const props = feature.properties;
  const ft = props.featureType || 'plantation';
  const crmBadge = PLACE_TYPE_CRM_BADGE[ft] || 'E25';
  const typeLabel = PLACE_TYPE_LABELS[ft] || ft;
  const color = PLACE_TYPE_COLORS[ft] || '#888';
  const biasInfo = biasTypes[ft];

  // Resolve linked entities — works for all feature types
  const plantationUri = props.plantationUri ?? null;
  const plantation = plantationUri
    ? (data.plantations[plantationUri] as E25Plantation | undefined)
    : undefined;

  const featureUri = props.featureUri ?? props.placeUri ?? '';
  const physicalFeature = data.physicalFeatures?.[featureUri];

  const orgUri = props.organizationQid
    ? `http://www.wikidata.org/entity/${props.organizationQid}`
    : plantation?.P52_has_current_owner;
  const organization = orgUri
    ? (data.organizations[orgUri] as E74Organization | undefined)
    : undefined;

  const placeUri = props.placeUri ?? physicalFeature?.P53_has_location ?? null;
  const place = placeUri
    ? (data.places[placeUri] as E53Place | undefined)
    : undefined;

  // Appellations for E25, E26 and E74
  const plantationApps = plantationUri
    ? ((data.appellations[plantationUri] || []) as E41Appellation[])
    : [];
  const featureApps = featureUri
    ? ((data.appellations[featureUri] || []) as E41Appellation[])
    : [];
  const orgApps = orgUri
    ? ((data.appellations[orgUri] || []) as E41Appellation[])
    : [];
  const allApps = [...plantationApps, ...featureApps, ...orgApps];
  const uniqueApps = Array.from(
    new Map(allApps.map((app) => [app['@id'], app])).values(),
  );

  // Observations
  const observations = orgUri
    ? ((data.observations[orgUri] || []) as OrganizationObservation[])
    : [];

  // Sources used
  const sourceUris = new Set<string>();
  for (const app of allApps) {
    if (app.P128i_is_carried_by) sourceUris.add(app.P128i_is_carried_by);
  }
  for (const obs of observations) {
    if (obs.hadPrimarySource) sourceUris.add(obs.hadPrimarySource);
  }
  if (place?.P70i_is_documented_in) sourceUris.add(place.P70i_is_documented_in);
  const sources = Array.from(sourceUris)
    .map((uri) => data.sources[uri] as E22Source | undefined)
    .filter(Boolean) as E22Source[];

  // Sort observations chronologically
  const sortedObservations = [...observations].sort(
    (a, b) => parseInt(a.observationYear) - parseInt(b.observationYear),
  );

  // Provenance records
  const provRecords: { label: string; record: ProvenanceRecord }[] = [];
  if (plantation?.wasDerivedFrom) {
    const p = data.provenance[plantation.wasDerivedFrom] as
      | ProvenanceRecord
      | undefined;
    if (p) provRecords.push({ label: 'Plantation (E25)', record: p });
  }
  if (organization?.wasDerivedFrom) {
    const p = data.provenance[organization.wasDerivedFrom] as
      | ProvenanceRecord
      | undefined;
    if (p) provRecords.push({ label: 'Organization (E74)', record: p });
  }
  if (place?.wasDerivedFrom) {
    const p = data.provenance[place.wasDerivedFrom] as
      | ProvenanceRecord
      | undefined;
    if (p) provRecords.push({ label: 'Location (E53)', record: p });
  }
  if (physicalFeature?.wasDerivedFrom) {
    const p = data.provenance[physicalFeature.wasDerivedFrom] as
      | ProvenanceRecord
      | undefined;
    if (p) provRecords.push({ label: 'Physical Feature (E26)', record: p });
  }

  // Coordinates (for display in the Location section)
  const coords =
    feature.geometry.type === 'Point'
      ? (feature.geometry.coordinates as number[])
      : feature.geometry.type === 'Polygon'
        ? (feature.geometry.coordinates as number[][][]).flat().flat()
        : [];

  // URI label for the header subtitle
  const headerUri = plantationUri || featureUri || placeUri || '';

  function scrollToSection(section: string) {
    const el = sectionRefs.current[section];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function NoDataPlaceholder() {
    return (
      <p className="text-[11px] text-stm-warm-300 italic px-4 pb-3">
        No data yet
      </p>
    );
  }

  return (
    <div className="absolute top-0 right-0 w-105 h-full bg-stm-warm-50 shadow-xl z-1001 flex flex-col border-l border-stm-warm-300">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stm-warm-300 bg-white">
        <div className="flex items-start justify-between">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-bold text-stm-warm-900 font-serif leading-tight flex items-center gap-2">
              {feature.geometry.type === 'Point' && (
                <span
                  className="w-3 h-3 rounded-full inline-block shrink-0"
                  style={{ backgroundColor: color }}
                />
              )}
              {props.name || 'Unknown'}
            </h2>
            <p className="text-[11px] text-stm-warm-400 font-mono mt-0.5">
              <Badge type={crmBadge} /> {typeLabel}
              {headerUri && (
                <span className="ml-1.5">{uriLabel(headerUri)}</span>
              )}
            </p>
            {(() => {
              const pid =
                props.stmId ??
                extractPlaceId(plantationUri || featureUri || placeUri || '');
              return pid ? (
                <Link
                  href={`/places?place=${pid}`}
                  className="inline-flex items-center gap-1 mt-1 text-[11px] text-stm-teal-600 hover:text-stm-teal-700 hover:underline"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Edit in gazetteer
                </Link>
              ) : null;
            })()}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center hover:bg-stm-warm-100 text-stm-warm-400 hover:text-stm-warm-600 transition-colors shrink-0"
            aria-label="Close detail panel"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M2 2l10 10M12 2L2 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Colonial terminology note */}
        {biasInfo && (
          <div className="mx-4 mt-3 mb-1 px-2 py-1.5 bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <span className="font-medium">Colonial terminology note:</span>{' '}
            {biasInfo.editorialNote}
            {biasInfo.altTerms.length > 0 && (
              <span className="block mt-0.5 text-amber-600 text-[10px]">
                Historical terms: {biasInfo.altTerms.join(', ')}
              </span>
            )}
          </div>
        )}

        {/* Entity Graph */}
        <div className="px-4 py-3 bg-white border-b border-stm-warm-200">
          <p className="text-[10px] font-semibold text-stm-warm-400 uppercase tracking-wider mb-1.5">
            Entity Connections
          </p>
          <EntityGraph
            plantation={plantation || null}
            organization={organization || null}
            place={place || null}
            appellations={uniqueApps}
            sources={sources}
            observationCount={observations.length}
            onNodeClick={scrollToSection}
            centerNode={
              !plantation
                ? { label: props.name || 'Unknown', crmType: crmBadge }
                : undefined
            }
          />
        </div>

        <div className="divide-y divide-stm-warm-200">
          {/* Feature / Plantation (E25 or E26) */}
          <div>
            <SectionHeader
              id="plantation"
              title={
                plantation
                  ? 'Plantation'
                  : physicalFeature
                    ? 'Physical Feature'
                    : 'Feature'
              }
              badge={crmBadge}
              open={openSections.plantation}
              onToggle={() => toggle('plantation')}
              refs={sectionRefs}
            />
            {openSections.plantation &&
              (plantation ? (
                <div className="px-4 pb-3 space-y-0">
                  <p className="text-[9px] text-stm-warm-300 font-mono mb-1">
                    E25 Human-Made Feature
                  </p>
                  <CrmField
                    label="Name"
                    crmClass="E41"
                    property="P1 is identified by"
                    value={plantation.prefLabel}
                  />
                  <CrmField
                    label="Status"
                    crmClass="E55"
                    property="P2 has type"
                    value={plantation.status}
                  />
                  <CrmField
                    label="Owner"
                    crmClass="E74"
                    property="P52 has current owner"
                    value={organization?.prefLabel}
                  />
                  <CrmField
                    label="Location"
                    crmClass="E53"
                    property="P53 has location"
                    value={
                      place?.observedLabel ||
                      (place ? `fid-${place.fid}` : null)
                    }
                  />
                  {plantation['depictedOnMap'] && (
                    <div className="mt-1.5">
                      <span className="text-[10px] text-stm-warm-400 uppercase tracking-wider">
                        P138i has representation
                      </span>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {plantation['depictedOnMap'].map((m, i) => (
                          <span
                            key={i}
                            className="bg-white text-stm-sepia-700 border border-stm-sepia-200 px-1.5 py-0.5 text-[10px]"
                          >
                            {m.mapId} &mdash; &ldquo;{m.labelOnMap}&rdquo;
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {uniqueApps.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <span className="text-[10px] text-stm-warm-400 uppercase tracking-wider">
                        E41 Appellations
                      </span>
                      {uniqueApps.map((app) => (
                        <AppellationRow
                          key={app['@id']}
                          app={app}
                          sourceLabel={
                            app.P128i_is_carried_by
                              ? data.sources[app.P128i_is_carried_by]
                                  ?.prefLabel ||
                                uriLabel(app.P128i_is_carried_by)
                              : null
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 pb-3 space-y-0">
                  <p className="text-[9px] text-stm-warm-300 font-mono mb-1">
                    {crmBadge === 'E26'
                      ? 'E26 Physical Feature'
                      : `${crmBadge} Feature`}
                  </p>
                  <CrmField
                    label="Name"
                    crmClass="E41"
                    property="P1 is identified by"
                    value={physicalFeature?.prefLabel || props.name}
                  />
                  <CrmField
                    label="Type"
                    crmClass="E55"
                    property="P2 has type"
                    value={typeLabel}
                  />
                  {props.mainBodyWater && (
                    <CrmField
                      label="Main body"
                      crmClass="E26"
                      property="mainBodyWater"
                      value={props.mainBodyWater}
                    />
                  )}
                  <CrmField
                    label="Feature ID"
                    crmClass="E42"
                    property="P48 has preferred identifier"
                    value={props.fid}
                    mono
                  />
                  {props.mapYear && (
                    <CrmField
                      label="Map Year"
                      crmClass="E52"
                      property="P4 has time-span"
                      value={props.mapYear}
                    />
                  )}
                  {uniqueApps.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <span className="text-[10px] text-stm-warm-400 uppercase tracking-wider">
                        E41 Appellations
                      </span>
                      {uniqueApps.map((app) => (
                        <AppellationRow
                          key={app['@id']}
                          app={app}
                          sourceLabel={
                            app.P128i_is_carried_by
                              ? data.sources[app.P128i_is_carried_by]
                                  ?.prefLabel ||
                                uriLabel(app.P128i_is_carried_by)
                              : null
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>

          {/* Organization (E74) */}
          <div>
            <SectionHeader
              id="organization"
              title="Organization"
              badge="E74"
              open={openSections.organization}
              onToggle={() => toggle('organization')}
              refs={sectionRefs}
            />
            {openSections.organization &&
              (organization ? (
                <div className="px-4 pb-3 space-y-0">
                  <p className="text-[9px] text-stm-warm-300 font-mono mb-1">
                    P52 has current owner
                  </p>
                  <CrmField
                    label="Name"
                    crmClass="E41"
                    property="P1 is identified by"
                    value={organization.prefLabel}
                  />
                  <CrmField label="Wikidata" crmClass="E74" property="@id" mono>
                    <WikidataLink qid={organization['@id']} />
                  </CrmField>
                  <CrmField
                    label="PSUR ID"
                    crmClass="E42"
                    property="P1 is identified by (E42 PSUR)"
                    value={organization.psurId}
                    mono
                  />
                  <CrmField
                    label="Dissolved by"
                    crmClass="E68"
                    property="P99i was dissolved by"
                    value={
                      organization.absorbedInto
                        ? uriLabel(organization.absorbedInto)
                        : null
                    }
                  />
                </div>
              ) : (
                <NoDataPlaceholder />
              ))}
          </div>

          {/* Location (E53) */}
          <div>
            <SectionHeader
              id="place"
              title="Location"
              badge="E53"
              open={openSections.place}
              onToggle={() => toggle('place')}
              refs={sectionRefs}
            />
            {openSections.place &&
              (place ? (
                <div className="px-4 pb-3 space-y-0">
                  <p className="text-[9px] text-stm-warm-300 font-mono mb-1">
                    P53 has location
                  </p>
                  <CrmField
                    label="Feature ID"
                    crmClass="E42"
                    property="P48 has preferred identifier"
                    value={place.fid}
                    mono
                  />
                  <CrmField
                    label="Map Year"
                    crmClass="E52"
                    property="P4 has time-span (via E12)"
                    value={place.mapYear}
                  />
                  <CrmField
                    label="Label"
                    crmClass="E41"
                    property="P1 is identified by"
                    value={place.observedLabel}
                  />
                  <CrmField
                    label="Source"
                    crmClass="E22"
                    property="P70i is documented in"
                    value={
                      place.P70i_is_documented_in
                        ? uriLabel(place.P70i_is_documented_in)
                        : null
                    }
                  />
                  <CrmField
                    label="Geometry Source"
                    crmClass="E22"
                    property="prov:wasDerivedFrom"
                    value={
                      place.hasGeometry?.geometrySource
                        ? uriLabel(place.hasGeometry.geometrySource)
                        : null
                    }
                  />
                  {feature.geometry.type === 'Point' && coords.length >= 2 && (
                    <CrmField
                      label="Coordinates"
                      crmClass="E53"
                      property="geo:asWKT"
                      value={`${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`}
                      mono
                    />
                  )}
                </div>
              ) : (
                <div className="px-4 pb-3 space-y-0">
                  {feature.geometry.type === 'Point' && coords.length >= 2 ? (
                    <>
                      <CrmField
                        label="Coordinates"
                        crmClass="E53"
                        property="geo:asWKT"
                        value={`${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`}
                        mono
                      />
                      {props.mapYear && (
                        <CrmField
                          label="Map Year"
                          crmClass="E52"
                          property="P4 has time-span"
                          value={props.mapYear}
                        />
                      )}
                    </>
                  ) : feature.geometry.type === 'LineString' ||
                    feature.geometry.type === 'MultiLineString' ||
                    feature.geometry.type === 'Polygon' ? (
                    <>
                      <CrmField
                        label="Geometry"
                        crmClass="E53"
                        property="geo:asWKT"
                        value={feature.geometry.type}
                      />
                      {props.mapYear && (
                        <CrmField
                          label="Map Year"
                          crmClass="E52"
                          property="P4 has time-span"
                          value={props.mapYear}
                        />
                      )}
                    </>
                  ) : (
                    <NoDataPlaceholder />
                  )}
                </div>
              ))}
          </div>

          {/* Timeline — annual observations from the Almanakken */}
          <div>
            <SectionHeader
              id="sources"
              title="Timeline"
              badge="E13"
              open={openSections.sources}
              onToggle={() => toggle('sources')}
              refs={sectionRefs}
              count={sortedObservations.length || undefined}
            />
            {openSections.sources &&
              (sortedObservations.length > 0 ? (
                <div className="px-3 pb-3">
                  <p className="text-[10px] text-stm-warm-400 mb-2">
                    Annual observations from Surinaamse Almanakken
                  </p>
                  <div className="space-y-0.5 max-h-128 overflow-y-auto">
                    {sortedObservations.map((obs) => (
                      <TimelineEntry
                        key={obs['@id']}
                        obs={obs}
                        sourceLabel={
                          obs.hadPrimarySource
                            ? data.sources[obs.hadPrimarySource]?.prefLabel ||
                              uriLabel(obs.hadPrimarySource)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <NoDataPlaceholder />
              ))}
          </div>

          {/* Sources */}
          <div>
            <SectionHeader
              id="sources-ref"
              title="Sources"
              badge="E22"
              open={openSections['sources-ref'] ?? false}
              onToggle={() => toggle('sources-ref')}
              refs={sectionRefs}
              count={sources.length || undefined}
            />
            {openSections['sources-ref'] &&
              (sources.length > 0 ? (
                <div className="px-4 pb-3 space-y-1.5">
                  {sources.map((src) => (
                    <div
                      key={src['@id']}
                      className="flex items-baseline gap-2 text-xs"
                    >
                      <Badge type="E22" />
                      <div className="min-w-0">
                        <span className="text-stm-warm-700 font-medium">
                          {src.prefLabel}
                        </span>
                        {src.mapYear && (
                          <span className="text-stm-warm-400 ml-1">
                            ({src.mapYear})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <NoDataPlaceholder />
              ))}
          </div>

          {/* Provenance */}
          <div>
            <SectionHeader
              id="provenance"
              title="Provenance"
              badge="PROV"
              open={openSections.provenance ?? false}
              onToggle={() => toggle('provenance')}
              refs={sectionRefs}
            />
            {openSections.provenance &&
              (provRecords.length > 0 ? (
                <div className="px-4 pb-3">
                  {provRecords.map(({ label, record }) => (
                    <div key={record['@id']} className="mb-2">
                      <p className="text-xs text-stm-warm-500 font-medium mb-0.5">
                        {label}
                      </p>
                      <ProvenanceChain record={record} />
                    </div>
                  ))}
                </div>
              ) : (
                <NoDataPlaceholder />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
