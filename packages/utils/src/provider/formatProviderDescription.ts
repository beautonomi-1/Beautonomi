/** Max characters shown on home/search provider listing cards (≈2 lines). */
export const PROVIDER_DESCRIPTION_CARD_MAX = 100;

/** Max characters for provider profile hero / summary preview (≈3–4 lines). */
export const PROVIDER_DESCRIPTION_PROFILE_PREVIEW_MAX = 240;

/**
 * Customer-facing provider bio: first letter uppercase, remainder lowercase.
 */
export function formatProviderDescriptionDisplay(
  description: string | null | undefined,
): string {
  const trimmed = (description ?? "").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  const cut =
    lastSpace > Math.floor(maxLength * 0.6) ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/** Listing cards (home, search, more-providers). */
export function formatProviderDescriptionForCard(
  description: string | null | undefined,
): string {
  const formatted = formatProviderDescriptionDisplay(description);
  if (!formatted) return "";
  return truncateAtWord(formatted, PROVIDER_DESCRIPTION_CARD_MAX);
}

/** Profile hero / summary strip above tabs. */
export function formatProviderDescriptionForProfilePreview(
  description: string | null | undefined,
): string {
  const formatted = formatProviderDescriptionDisplay(description);
  if (!formatted) return "";
  return truncateAtWord(formatted, PROVIDER_DESCRIPTION_PROFILE_PREVIEW_MAX);
}
