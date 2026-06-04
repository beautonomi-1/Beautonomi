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

export function resolveJoinedBadge(
  joined: ProviderPointsBadgeJoin,
): BadgeRow | null {
  if (!joined) return null;
  return Array.isArray(joined) ? joined[0] ?? null : joined;
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
): ProgressToNextBadge {
  if (!allBadges?.length) return null;
  const currentTier = currentBadge?.tier ?? 0;
  const nextBadgeCandidate = allBadges.find((b) => b.tier > currentTier);
  if (!nextBadgeCandidate) return null;

  const requirements = nextBadgeCandidate.requirements as { points?: number } | null;
  const requiredPoints = requirements?.points ?? 0;
  const progress =
    requiredPoints > 0
      ? Math.min(100, Math.round((currentPoints / requiredPoints) * 100))
      : 0;

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
    const requirements = row.requirements as { points?: number } | null;
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
