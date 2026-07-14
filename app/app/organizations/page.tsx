'use client';

import { useAuth } from '@/lib/auth';
import type {
  E25Plantation,
  E41Appellation,
  E74Organization,
  OrganizationObservation,
} from '@/lib/types';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

type OrganizationData = {
  organizations: Record<string, E74Organization>;
};

type OrganizationDetails = {
  organizationUri: string;
  plantations: E25Plantation[];
  appellations: E41Appellation[];
  observations: OrganizationObservation[];
  gazetteerPlantations: Array<{
    id: string;
    prefLabel: string;
    associationStatus: 'linked' | 'needs-physical-link-review';
  }>;
  explorePlantations: Array<{
    id: string;
    prefLabel: string;
    featureUri: string;
    associationStatus:
      | 'linked'
      | 'needs-organization-link'
      | 'needs-physical-link-review';
  }>;
};

type EditState = {
  preferredLabel: string;
  alternativeLabels: string;
  editorialNote: string;
  reviewStatus: 'unreviewed' | 'reviewed' | 'disputed';
};

const emptyData: OrganizationData = {
  organizations: {},
};

function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function qidFor(organization: E74Organization): string {
  return organization.exactMatch?.split('/').pop() ?? organization['@id'].split('/').pop() ?? '';
}

function editStateFor(organization: E74Organization): EditState {
  return {
    preferredLabel: organization.prefLabel ?? '',
    alternativeLabels: asArray(organization.altLabel).join('\n'),
    editorialNote: organization.editorialNote ?? '',
    reviewStatus: organization.authorityReviewStatus ?? 'unreviewed',
  };
}

function statusClass(status: string): string {
  if (status === 'reviewed') return 'bg-teal-soft text-teal-strong';
  if (status === 'disputed') return 'bg-red-100 text-red-700';
  return 'bg-sand text-ink/65';
}

function associationStatusLabel(status: string): string {
  if (status === 'linked') return 'Linked';
  if (status === 'needs-organization-link') return 'Needs Gazetteer authority link';
  return 'Needs physical-link review';
}

export default function OrganizationsPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl px-4 py-8 text-sm text-ink/60">Loading organizations...</main>}>
      <OrganizationsPageInner />
    </Suspense>
  );
}

function OrganizationsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canEdit } = useAuth();
  const [data, setData] = useState<OrganizationData>(emptyData);
  const [details, setDetails] = useState<OrganizationDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/organizations.json')
      .then((response) => response.json())
      .then((organizations) => {
        setData({ organizations });
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load organizations');
      })
      .finally(() => setLoading(false));
  }, []);

  const organizations = useMemo(
    () =>
      Object.values(data.organizations).sort((a, b) =>
        a.prefLabel.localeCompare(b.prefLabel, undefined, { sensitivity: 'base' }),
      ),
    [data.organizations],
  );
  const selectedQid = searchParams.get('organization');
  const selected =
    organizations.find((organization) => qidFor(organization) === selectedQid) ??
    organizations[0];

  useEffect(() => {
    if (selected) setEdit(editStateFor(selected));
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetails(null);
    setDetailsLoading(true);
    fetch(`/api/organizations?qid=${encodeURIComponent(qidFor(selected))}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load organization details');
        return response.json() as Promise<OrganizationDetails>;
      })
      .then(setDetails)
      .catch((detailsError: unknown) => {
        if (detailsError instanceof Error && detailsError.name === 'AbortError') return;
        setError(
          detailsError instanceof Error
            ? detailsError.message
            : 'Failed to load organization details',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailsLoading(false);
      });
    return () => controller.abort();
  }, [selected]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return organizations.filter((organization) => {
      const qid = qidFor(organization);
      const names = asArray(organization.altLabel);
      const matchesQuery =
        !needle ||
        organization.prefLabel.toLowerCase().includes(needle) ||
        qid.toLowerCase().includes(needle) ||
        names.some((name) => name.toLowerCase().includes(needle));
      return (
        matchesQuery &&
        (statusFilter === 'all' ||
          (organization.authorityReviewStatus ?? 'unreviewed') === statusFilter)
      );
    });
  }, [organizations, query, statusFilter]);

  const linkedPlantations = useMemo(
    () =>
      [...(details?.plantations ?? [])].sort((a, b) =>
        a.prefLabel.localeCompare(b.prefLabel),
      ),
    [details],
  );
  const observations = details
    ? [...details.observations].sort(
        (a, b) => Number(a.observationYear) - Number(b.observationYear),
      )
    : [];
  const appellations = details?.appellations ?? [];
  const years = observations.map((observation) => Number(observation.observationYear)).filter(Number.isFinite);

  function selectOrganization(organization: E74Organization) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('organization', qidFor(organization));
    router.replace(`/organizations?${params.toString()}`);
    setNotice(null);
    setError(null);
  }

  async function saveOrganization() {
    if (!selected || !edit) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qid: qidFor(selected),
          preferredLabel: edit.preferredLabel,
          alternativeLabels: edit.alternativeLabels.split('\n'),
          editorialNote: edit.editorialNote,
          reviewStatus: edit.reviewStatus,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        publication?: { commit?: string };
      };
      if (!response.ok) throw new Error(result.error ?? 'Failed to save organization');
      setData((current) => ({
        ...current,
        organizations: {
          ...current.organizations,
          [selected['@id']]: {
            ...selected,
            prefLabel: edit.preferredLabel || selected.prefLabel,
            altLabel: edit.alternativeLabels.split('\n').map((label) => label.trim()).filter(Boolean),
            editorialNote: edit.editorialNote || undefined,
            authorityReviewStatus: edit.reviewStatus,
          },
        },
      }));
      setNotice(
        result.publication?.commit
          ? `Saved in commit ${result.publication.commit.slice(0, 8)}; publication pending.`
          : 'Saved; publication pending.',
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save organization');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-6xl px-4 py-8 text-sm text-ink/60">Loading organizations...</main>;
  }

  return (
    <main className="h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-ink/15 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Plantation organizations</h1>
          <p className="mt-1 text-xs text-ink/55">
            {organizations.length.toLocaleString()} E74 groups | {linkedPlantations.length} mapped E25 and {details?.gazetteerPlantations.length ?? 0} Gazetteer records selected
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="bg-entity-e74 px-2 py-1 font-semibold text-ink">E74</span>
          <span className="bg-entity-e25 px-2 py-1 font-semibold text-ink">E25 linked by authority correspondence</span>
        </div>
      </div>

      {error && <div className="mb-3 border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      {notice && <div className="mb-3 border-l-4 border-teal-strong bg-teal-soft px-3 py-2 text-sm text-ink">{notice}</div>}

      <div className="grid min-h-[70vh] grid-cols-1 gap-0 border border-ink/15 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-ink/15 bg-white lg:border-b-0 lg:border-r">
          <div
            className="grid gap-2 border-b border-ink/10 p-3"
            style={{ gridTemplateColumns: 'minmax(0, 1fr) 112px' }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or QID"
              className="min-w-0 border border-ink/20 bg-white px-2 py-2 text-sm outline-none focus:border-teal-strong"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="border border-ink/20 bg-white px-2 py-2 text-xs outline-none focus:border-teal-strong"
            >
              <option value="all">All status</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="reviewed">Reviewed</option>
              <option value="disputed">Disputed</option>
            </select>
          </div>
          <div className="max-h-[68vh] overflow-y-auto">
            {filtered.map((organization) => {
              const qid = qidFor(organization);
              const active = selected?.['@id'] === organization['@id'];
              return (
                <button
                  key={organization['@id']}
                  type="button"
                  onClick={() => selectOrganization(organization)}
                  className={`grid w-full gap-2 border-b border-ink/10 px-3 py-2.5 text-left transition-colors ${active ? 'bg-teal-soft' : 'bg-white hover:bg-cream'}`}
                  style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{organization.prefLabel}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-ink/45">{qid}</span>
                  </span>
                  <span className="text-right">
                    <span className={`block px-1.5 py-0.5 text-[9px] uppercase ${statusClass(organization.authorityReviewStatus ?? 'unreviewed')}`}>
                      {organization.authorityReviewStatus ?? 'unreviewed'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {selected && edit && (
          <section className="min-w-0 bg-cream/35">
            <div className="border-b border-ink/15 bg-white px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-ink">{selected.prefLabel}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/55">
                    <a href={selected['@id']} className="break-all font-mono text-teal-strong hover:underline">{selected['@id']}</a>
                    <a href={`${selected['@id']}.jsonld`} className="text-teal-strong hover:underline">JSON-LD</a>
                    {selected.exactMatch && <a href={selected.exactMatch} target="_blank" rel="noreferrer" className="text-teal-strong hover:underline">Wikidata {qidFor(selected)}</a>}
                    {(details?.gazetteerPlantations.length ?? 0) > 1 &&
                      details?.gazetteerPlantations.every(
                        (plantation) => plantation.associationStatus === 'linked',
                      ) && (
                        <span className="border border-teal-strong/30 bg-teal-soft px-1.5 py-0.5 text-teal-strong">
                          Multiple physical plantations reviewed
                        </span>
                      )}
                  </div>
                </div>
                <span className={`px-2 py-1 text-[10px] font-semibold uppercase ${statusClass(selected.authorityReviewStatus ?? 'unreviewed')}`}>
                  {selected.authorityReviewStatus ?? 'unreviewed'}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
                <div><dt className="text-ink/45">Observations</dt><dd className="mt-0.5 font-semibold tabular-nums">{observations.length}</dd></div>
                <div><dt className="text-ink/45">Years</dt><dd className="mt-0.5 font-semibold tabular-nums">{years.length ? `${Math.min(...years)}-${Math.max(...years)}` : '-'}</dd></div>
                <div><dt className="text-ink/45">Physical plantations</dt><dd className="mt-0.5 font-semibold tabular-nums">{linkedPlantations.length + (details?.gazetteerPlantations.length ?? 0)}</dd></div>
                <div><dt className="text-ink/45">Source names</dt><dd className="mt-0.5 font-semibold tabular-nums">{appellations.length}</dd></div>
              </dl>
            </div>

            <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 divide-y divide-ink/10">
                <section className="px-4 py-4 sm:px-5">
                  <h3 className="mb-2 text-xs font-semibold uppercase text-ink/55">Linked physical plantations</h3>
                  {linkedPlantations.length ? (
                    <div className="divide-y divide-ink/10 border-y border-ink/10 bg-white">
                      {linkedPlantations.map((plantation) => {
                        const exploreRecord = details?.explorePlantations.find(
                          (candidate) => candidate.featureUri === plantation['@id'],
                        );
                        const associationStatus =
                          exploreRecord?.associationStatus ??
                          plantation.organizationAssociationStatus ??
                          'linked';
                        return (
                          <div key={plantation['@id']} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                            <div><span className="font-medium">{plantation.prefLabel}</span><span className="ml-2 font-mono text-[10px] text-ink/40">{plantation.status}</span></div>
                            <div className="flex gap-3 text-xs">
                              <span className={associationStatus === 'linked' ? 'text-teal-strong' : 'bg-yellow-100 px-1 text-yellow-900'}>{associationStatusLabel(associationStatus)}</span>
                              <a href={plantation['@id']} className="text-teal-strong hover:underline">E25 record</a>
                              {exploreRecord && <Link href={`/explore?place=${exploreRecord.id}`} className="text-teal-strong hover:underline">Explore</Link>}
                              {exploreRecord && <Link href={`/places?place=${exploreRecord.id}`} className="text-teal-strong hover:underline">Edit place</Link>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="text-sm text-ink/50">No mapped E25 plantation match.</p>}
                  {(details?.gazetteerPlantations.length ?? 0) > 0 && (
                    <div className="mt-2 divide-y divide-ink/10 border-y border-ink/10 bg-white">
                      {details?.gazetteerPlantations.map((plantation) => (
                        <div key={plantation.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                          <div>
                            <span className="font-medium">{plantation.prefLabel}</span>
                            <span className="ml-2 font-mono text-[10px] text-ink/40">Gazetteer</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className={plantation.associationStatus === 'linked' ? 'text-teal-strong' : 'bg-yellow-100 px-1 text-yellow-900'}>{associationStatusLabel(plantation.associationStatus)}</span>
                            <Link href={`/places?place=${plantation.id}`} className="text-teal-strong hover:underline">Open place</Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="px-4 py-4 sm:px-5">
                  <h3 className="mb-2 text-xs font-semibold uppercase text-ink/55">Source appellations</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {appellations.map((appellation) => (
                      <span key={appellation['@id']} className="border border-ink/15 bg-white px-2 py-1 text-xs">{appellation.P190_has_symbolic_content}</span>
                    ))}
                  </div>
                </section>

                <section className="px-4 py-4 sm:px-5">
                  <h3 className="mb-2 text-xs font-semibold uppercase text-ink/55">Almanakken observations</h3>
                  {detailsLoading ? <p className="text-sm text-ink/50">Loading observations...</p> : <div className="overflow-x-auto border border-ink/10 bg-white">
                    <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                      <thead className="bg-cream text-[10px] uppercase text-ink/50"><tr><th className="px-2 py-2">Year</th><th className="px-2 py-2">Name</th><th className="px-2 py-2">Owner</th><th className="px-2 py-2">Product</th><th className="px-2 py-2">Population</th><th className="px-2 py-2">Inference</th></tr></thead>
                      <tbody className="divide-y divide-ink/10">
                        {observations.map((observation) => (
                          <tr key={observation['@id']}>
                            <td className="px-2 py-2 font-mono tabular-nums">{observation.observationYear}</td>
                            <td className="px-2 py-2">{observation.observedName || '-'}</td>
                            <td className="max-w-[220px] truncate px-2 py-2" title={observation.hasOwner}>{observation.hasOwner || '-'}</td>
                            <td className="px-2 py-2">{observation.product || '-'}</td>
                            <td className="px-2 py-2 tabular-nums">{observation.enslavedCount ?? '-'}</td>
                            <td className="px-2 py-2 text-[10px]">{observation.presenceInferenceStatus || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>}
                </section>
              </div>

              <aside className="border-t border-ink/15 bg-white px-4 py-4 xl:border-l xl:border-t-0">
                <h3 className="mb-3 text-xs font-semibold uppercase text-ink/55">Authority editorial record</h3>
                <div className="space-y-3">
                  <label className="block text-xs text-ink/60">Preferred label<input disabled={!canEdit} value={edit.preferredLabel} onChange={(event) => setEdit({ ...edit, preferredLabel: event.target.value })} className="mt-1 w-full border border-ink/20 bg-white px-2 py-2 text-sm text-ink outline-none disabled:bg-cream disabled:text-ink/55" /></label>
                  <label className="block text-xs text-ink/60">Editorial alternative labels<textarea disabled={!canEdit} rows={4} value={edit.alternativeLabels} onChange={(event) => setEdit({ ...edit, alternativeLabels: event.target.value })} className="mt-1 w-full resize-y border border-ink/20 bg-white px-2 py-2 text-sm text-ink outline-none disabled:bg-cream disabled:text-ink/55" /></label>
                  <label className="block text-xs text-ink/60">Editorial note<textarea disabled={!canEdit} rows={5} value={edit.editorialNote} onChange={(event) => setEdit({ ...edit, editorialNote: event.target.value })} className="mt-1 w-full resize-y border border-ink/20 bg-white px-2 py-2 text-sm text-ink outline-none disabled:bg-cream disabled:text-ink/55" /></label>
                  <label className="block text-xs text-ink/60">Review status<select disabled={!canEdit} value={edit.reviewStatus} onChange={(event) => setEdit({ ...edit, reviewStatus: event.target.value as EditState['reviewStatus'] })} className="mt-1 w-full border border-ink/20 bg-white px-2 py-2 text-sm text-ink outline-none disabled:bg-cream"><option value="unreviewed">Unreviewed</option><option value="reviewed">Reviewed</option><option value="disputed">Disputed</option></select></label>
                  {selected.modifiedAt && <p className="text-[10px] text-ink/45">Modified {selected.modifiedAt}{selected.modifiedBy ? ` by ${selected.modifiedBy}` : ''}</p>}
                  <button type="button" disabled={!canEdit || saving} onClick={saveOrganization} className="site-action-primary w-full px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-45">{saving ? 'Saving...' : 'Save organization'}</button>
                </div>
              </aside>
            </div>
          </section>
        )}
      </div>
      </div>
    </main>
  );
}
