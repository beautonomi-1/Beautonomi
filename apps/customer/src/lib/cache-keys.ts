export const CART_CACHE_KEY_PREFIX = "beautonomi_cart";
export const LEGACY_CART_CACHE_KEY = CART_CACHE_KEY_PREFIX;

export const BOOKINGS_CACHE_KEY_PREFIX = "beautonomi_bookings";
export const LEGACY_BOOKINGS_CACHE_KEY_PREFIX = "beautonomi_bookings_";

/**
 * §Customer-audit 2026-04: per-user profile summary cache written by the
 * Profile tab so re-opening the tab renders instantly from disk while a
 * background refresh revalidates. Keyed as `<prefix>.<user_id>` — the
 * dotted suffix is intentional so sign-out cleanup can sweep any stale
 * row regardless of which user was signed in last.
 */
export const PROFILE_SUMMARY_CACHE_KEY_PREFIX = "customer.profile-summary.v1";
