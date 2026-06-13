export const BADGE_REQUIREMENT_KEYS = [
  "points",
  "min_rating",
  "min_reviews",
  "min_bookings",
] as const;

export type BadgeRequirementKey = (typeof BADGE_REQUIREMENT_KEYS)[number];

export function parseBadgeJsonObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function validateRequirementNumber(
  obj: Record<string, unknown>,
  key: BadgeRequirementKey
): void {
  if (!(key in obj)) return;
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`requirements.${key} must be a non-negative number`);
  }
}

export function validateBadgeRequirements(requirements: unknown): Record<string, unknown> {
  const obj = parseBadgeJsonObject(requirements, "Requirements");
  for (const key of BADGE_REQUIREMENT_KEYS) {
    validateRequirementNumber(obj, key);
  }
  return obj;
}

export function validateBadgeBenefits(benefits: unknown): Record<string, unknown> {
  return parseBadgeJsonObject(benefits, "Benefits");
}

/** Mirrors check_provider_badges() eligibility after migration 686 (missing keys = 0). */
export function badgeMatchesProvider(
  requirements: Record<string, unknown>,
  provider: { points: number; rating: number; reviews: number; bookings: number }
): boolean {
  const minPoints = Number(requirements.points ?? 0);
  const minRating = Number(requirements.min_rating ?? 0);
  const minReviews = Number(requirements.min_reviews ?? 0);
  const minBookings = Number(requirements.min_bookings ?? 0);

  return (
    minPoints <= provider.points &&
    minRating <= provider.rating &&
    minReviews <= provider.reviews &&
    minBookings <= provider.bookings
  );
}
