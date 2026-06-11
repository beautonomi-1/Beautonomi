/** Valid `providers.team_size` values (migration 176 CHECK constraint). */
export const VALID_PROVIDER_TEAM_SIZES = [
  "freelancer",
  "small",
  "medium",
  "large",
] as const;

export type ProviderTeamSize = (typeof VALID_PROVIDER_TEAM_SIZES)[number];

/**
 * Resolve a DB-valid team_size from onboarding draft data.
 * Falls back from business_type when the draft omits or uses legacy values
 * (e.g. admin drafts with "just_me").
 */
export function resolveTeamSizeFromOnboardingDraft(
  draftData: Record<string, unknown>,
): ProviderTeamSize {
  const raw = draftData.team_size;
  if (
    typeof raw === "string" &&
    (VALID_PROVIDER_TEAM_SIZES as readonly string[]).includes(raw)
  ) {
    return raw as ProviderTeamSize;
  }

  const businessType = draftData.business_type;
  if (businessType === "mobile" || businessType === "freelancer") {
    return "freelancer";
  }

  return "small";
}
