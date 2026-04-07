/**
 * Bump `CONSENT_SCHEMA_VERSION` only when the JSON shape of stored consent changes (migrate in `storage.ts`).
 */
export const CONSENT_SCHEMA_VERSION = 1 as const;

/**
 * Bump when categories, defaults, or legal meaning of stored consent changes (users see the banner again).
 * Format: dated revision — keep sortable and human-readable.
 */
export const POLICY_VERSION = "2026-04-07.1";

export const STORAGE_KEY = "beautonomi_cookie_consent_v1";

/** Optional first-party mirror for middleware / future server reads (non-HttpOnly). */
export const CONSENT_COOKIE_NAME = "bn_cookie_consent";

/** Max age ~400 days (common CMP pattern). */
export const CONSENT_COOKIE_MAX_AGE_SEC = 34560000;
