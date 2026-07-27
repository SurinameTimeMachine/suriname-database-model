export type PhysicalLinkReviewFields = {
  physicalLinkReviewStatus?: 'confirmed-multiple';
  reviewedPhysicalPlaceIds?: string[];
  associatedPhysicalPlaceIds?: string[];
};

export type PhysicalPlaceCandidate = {
  id: string;
  fid?: string | number | null;
};

export type ConfirmedPhysicalLinkReview = {
  associatedPlaceIds: Set<string>;
  associatedFids: Set<string>;
};

export function normalizePhysicalPlaceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map(String).map((id) => id.trim()).filter(Boolean),
    ),
  ].sort();
}

export function resolveConfirmedPhysicalLinkReview(
  override: PhysicalLinkReviewFields | undefined,
  candidates: PhysicalPlaceCandidate[],
): ConfirmedPhysicalLinkReview | null {
  const reviewedPlaceIds = normalizePhysicalPlaceIds(
    override?.reviewedPhysicalPlaceIds,
  );
  const activePlaceIds = normalizePhysicalPlaceIds(
    candidates.map((candidate) => candidate.id),
  );
  if (
    override?.physicalLinkReviewStatus !== 'confirmed-multiple' ||
    activePlaceIds.length < 2 ||
    activePlaceIds.join('\u0000') !== reviewedPlaceIds.join('\u0000')
  ) {
    return null;
  }

  const associatedPlaceIds = new Set(
    override.associatedPhysicalPlaceIds == null
      ? activePlaceIds
      : normalizePhysicalPlaceIds(override.associatedPhysicalPlaceIds),
  );
  if (
    associatedPlaceIds.size < 2 ||
    [...associatedPlaceIds].some((id) => !activePlaceIds.includes(id))
  ) {
    return null;
  }

  return {
    associatedPlaceIds,
    associatedFids: new Set(
      candidates.flatMap((candidate) =>
        associatedPlaceIds.has(candidate.id) && candidate.fid != null
          ? [String(candidate.fid)]
          : [],
      ),
    ),
  };
}

export function resolveConfirmedPhysicalLinkReviews(
  overrides: ReadonlyMap<string, PhysicalLinkReviewFields>,
  candidatesByQid: ReadonlyMap<string, PhysicalPlaceCandidate[]>,
): Map<string, ConfirmedPhysicalLinkReview> {
  return new Map(
    [...overrides.entries()].flatMap(([qid, override]) => {
      const review = resolveConfirmedPhysicalLinkReview(
        override,
        candidatesByQid.get(qid) ?? [],
      );
      return review ? [[qid, review]] : [];
    }),
  );
}
