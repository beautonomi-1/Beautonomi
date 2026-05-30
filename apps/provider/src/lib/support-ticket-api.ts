/**
 * Support ticket API base path for provider mobile.
 *
 * Uses `/api/me/support-tickets` — stable on Expo/mobile (Bearer auth, no
 * provider-org header). Accepts provider_owner / provider_staff and returns
 * the full public message thread for tickets owned by the current user.
 */
export const SUPPORT_TICKETS_API_PREFIX = "/api/me/support-tickets";
