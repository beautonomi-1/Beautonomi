/**
 * §Provider-image fallback helpers for the customer web.
 *
 * Centralises the "what image should this card show?" decision for provider
 * cards on the homepage, nearby section, and search results.
 *
 * Why this exists:
 *
 * - The homepage card used to hardcode `/images/placeholder-provider.jpg`,
 *   but that asset is not shipped under `apps/web/public/images/`. Next/Image
 *   would then loop through `/_next/image?url=%2Fimages%2Fplaceholder-provider.jpg`
 *   and return 404 for every provider missing a `thumbnail_url`, spamming the
 *   browser console.
 * - The customer RN app (`apps/customer/src/components/ProviderCard.tsx`)
 *   keeps showing the provider's `avatar_url` even when `thumbnail_url` is
 *   missing. The web should match that behaviour so providers that only
 *   uploaded a profile photo still look right on the homepage card.
 *
 * Contract:
 *
 * - {@link providerHeroImageCandidates} returns the ordered image fallback
 *   list for cards (provider thumbnail → avatar → bundled SVG fallback under
 *   `public/`).
 * - {@link providerHeroImage} returns the first candidate for initial render.
 * - {@link providerAvatarImage} returns `null` when no usable photo exists,
 *   so the card can render initials instead of triggering another image
 *   request for the placeholder.
 */

/** Bundled fallback that actually exists under `apps/web/public/`. */
export const WEB_PROVIDER_IMAGE_FALLBACK = "/placeholder.svg" as const;

/** Minimum shape needed to pick provider card images. */
export interface ProviderImageInput {
  thumbnail_url?: string | null;
  avatar_url?: string | null;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

/**
 * Image to use for the provider card hero (main listing photo).
 *
 * Prefers the explicit `thumbnail_url`, falls back to the business
 * `avatar_url` so providers without a hero image still render a real photo,
 * and finally returns the bundled web fallback when nothing is set.
 */
export function providerHeroImage(provider: ProviderImageInput): string {
  return firstNonEmpty(provider.thumbnail_url, provider.avatar_url) ?? WEB_PROVIDER_IMAGE_FALLBACK;
}

/**
 * Ordered hero image fallbacks for provider listing cards.
 *
 * The first item is the initial image. If it 404s, the card should try the
 * next item before giving up to the bundled placeholder. This mirrors the
 * customer app UX: providers with a broken/missing hero image can still show
 * their uploaded avatar clearly.
 */
export function providerHeroImageCandidates(provider: ProviderImageInput): string[] {
  const candidates = [
    firstNonEmpty(provider.thumbnail_url),
    firstNonEmpty(provider.avatar_url),
    WEB_PROVIDER_IMAGE_FALLBACK,
  ].filter((value): value is string => Boolean(value));
  return [...new Set(candidates)];
}

/**
 * Image to use for the circular "business face" avatar on the card.
 *
 * Returns `null` when nothing usable exists so the caller can render
 * initials instead of a broken image / 404 placeholder request.
 */
export function providerAvatarImage(provider: ProviderImageInput): string | null {
  return firstNonEmpty(provider.avatar_url, provider.thumbnail_url);
}
