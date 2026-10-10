export type BadgeRow = {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  tier: number;
  color?: string | null;
  icon_url?: string | null;
  requirements?: unknown;
  benefits?: unknown;
};

export type ProviderPointsBadgeJoin = BadgeRow | BadgeRow[] | null | undefined;

export type BadgeRequirements = {
  points?: number;
  min_bookings?: number;
  min_reviews?: number;
  min_rating?: number;
};

export type BadgeRequirementProgressStats = {
  totalBookings: number;
  reviewCount: number;
  ratingAverage: number;
};

export function resolveJoinedBadge(
  joined: ProviderPointsBadgeJoin,
): BadgeRow | null {
  if (!joined) return null;
  return Array.isArray(joined) ? joined[0] ?? null : joined;
}

function requirementFraction(current: number, required: number): number {
  if (required <= 0) return 1;
  if (current <= 0) return 0;
  return Math.min(1, current / required);
}

/** Combined progress toward badge SQL eligibility (663): minimum across all set requirements. */
export function badgeEligibilityProgressFraction(
  requirements: BadgeRequirements | null | undefined,
  currentPoints: number,
  stats?: BadgeRequirementProgressStats,
): number {
  const req = requirements ?? {};
  const fractions: number[] = [];

  if ((req.points ?? 0) > 0) {
    fractions.push(requirementFraction(currentPoints, req.points!));
  }
  if (stats && (req.min_bookings ?? 0) > 0) {
    fractions.push(requirementFraction(stats.totalBookings, req.min_bookings!));
  }
  if (stats && (req.min_reviews ?? 0) > 0) {
    fractions.push(requirementFraction(stats.reviewCount, req.min_reviews!));
  }
  if (stats && (req.min_rating ?? 0) > 0) {
    fractions.push(requirementFraction(stats.ratingAverage, req.min_rating!));
  }

  if (fractions.length === 0) {
    return 0;
  }
  return Math.min(...fractions);
}

export type ProgressToNextBadge = {
  badge: BadgeRow;
  current_points: number;
  required_points: number;
  points_needed: number;
  progress_percentage: number;
} | null;

export function buildProgressToNextBadge(
  allBadges: BadgeRow[] | null | undefined,
  currentBadge: BadgeRow | null,
  currentPoints: number,
  stats?: BadgeRequirementProgressStats,
): ProgressToNextBadge {
  if (!allBadges?.length) return null;
  const currentTier = currentBadge?.tier ?? 0;
  const nextBadgeCandidate = allBadges.find((b) => b.tier > currentTier);
  if (!nextBadgeCandidate) return null;

  const requirements = nextBadgeCandidate.requirements as BadgeRequirements | null;
  const requiredPoints = requirements?.points ?? 0;
  const fraction = badgeEligibilityProgressFraction(requirements, currentPoints, stats);
  const progress = Math.min(100, Math.round(fraction * 100));

  return {
    badge: nextBadgeCandidate,
    current_points: currentPoints,
    required_points: requiredPoints,
    points_needed: Math.max(0, requiredPoints - currentPoints),
    progress_percentage: progress,
  };
}

export type LadderBadgeStatus = "current" | "earned" | "next" | "locked";

export function buildBadgeLadder(
  allBadges: BadgeRow[],
  currentBadge: BadgeRow | null,
  progressToNext: ProgressToNextBadge,
) {
  const currentTier = currentBadge?.tier ?? 0;
  const currentBadgeId = currentBadge?.id ?? null;
  const nextBadgeId = progressToNext?.badge?.id ?? null;

  return allBadges.map((row) => {
    const requirements = row.requirements as BadgeRequirements | null;
    let status: LadderBadgeStatus;
    if (currentBadgeId && row.id === currentBadgeId) {
      status = "current";
    } else if (row.tier < currentTier) {
      status = "earned";
    } else if (nextBadgeId && row.id === nextBadgeId) {
      status = "next";
    } else {
      status = "locked";
    }
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      tier: row.tier,
      color: row.color,
      icon_url: row.icon_url,
      requirements: row.requirements,
      benefits: row.benefits,
      status,
      points_required: requirements?.points ?? 0,
    };
  });
}
