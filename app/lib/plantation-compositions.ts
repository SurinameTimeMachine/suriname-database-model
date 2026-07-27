export interface PlantationCompositionEvidence {
  observationUri: string;
  compositeOrganizationUri: string;
  componentOrganizationUris: string[];
  year: number;
  sourceUri?: string;
}

export interface DerivedPlantationCompositionPeriod {
  id: string;
  compositeOrganizationUri: string;
  componentOrganizationUris: string[];
  startYear: number;
  endYear: number;
  observationYears: number[];
  evidenceUris: string[];
  sourceUris: string[];
}

function uriIdentifier(uri: string): string {
  return uri.split('/').filter(Boolean).pop()?.toLowerCase() ?? 'unknown';
}

/**
 * Group annual source observations into consecutive, identically composed
 * periods. Gaps produce separate periods so an unobserved year is never
 * silently asserted as part of a continuous combination.
 */
export function derivePlantationCompositionPeriods(
  evidence: PlantationCompositionEvidence[],
  base = 'https://data.surinametijdmachine.org/',
): DerivedPlantationCompositionPeriod[] {
  const grouped = new Map<string, PlantationCompositionEvidence[]>();

  for (const item of evidence) {
    const components = [...new Set(item.componentOrganizationUris)]
      .filter(Boolean)
      .sort();
    if (
      !item.compositeOrganizationUri ||
      components.length < 2 ||
      !Number.isInteger(item.year)
    ) {
      continue;
    }
    const key = JSON.stringify([item.compositeOrganizationUri, components]);
    grouped.set(key, [
      ...(grouped.get(key) ?? []),
      { ...item, componentOrganizationUris: components },
    ]);
  }

  const periods: DerivedPlantationCompositionPeriod[] = [];
  for (const observations of grouped.values()) {
    observations.sort(
      (a, b) =>
        a.year - b.year || a.observationUri.localeCompare(b.observationUri),
    );
    let run: PlantationCompositionEvidence[] = [];

    const appendRun = () => {
      if (run.length === 0) return;
      const first = run[0];
      const observationYears = [...new Set(run.map((item) => item.year))];
      const startYear = observationYears[0];
      const endYear = observationYears.at(-1) ?? startYear;
      const componentKey = first.componentOrganizationUris
        .map(uriIdentifier)
        .join('-');
      periods.push({
        id: `${base}organization-composition/${uriIdentifier(first.compositeOrganizationUri)}-${componentKey}-${startYear}-${endYear}`,
        compositeOrganizationUri: first.compositeOrganizationUri,
        componentOrganizationUris: first.componentOrganizationUris,
        startYear,
        endYear,
        observationYears,
        evidenceUris: [...new Set(run.map((item) => item.observationUri))],
        sourceUris: [
          ...new Set(
            run.flatMap((item) => (item.sourceUri ? [item.sourceUri] : [])),
          ),
        ],
      });
      run = [];
    };

    for (const observation of observations) {
      const previousYear = run.at(-1)?.year;
      if (previousYear != null && observation.year > previousYear + 1) {
        appendRun();
      }
      run.push(observation);
    }
    appendRun();
  }

  return periods.sort(
    (a, b) =>
      a.startYear - b.startYear ||
      a.compositeOrganizationUri.localeCompare(b.compositeOrganizationUri) ||
      a.id.localeCompare(b.id),
  );
}
