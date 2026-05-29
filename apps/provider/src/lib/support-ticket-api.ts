/**
 * Support ticket API base path for provider mobile.
 *
 * Uses `/api/me/support-tickets` because that namespace is live on production
 * and accepts provider_owner / provider_staff (sets requester_type: provider).
 * Revert to `/api/provider/support-tickets` once those routes are deployed.
 */
export const SUPPORT_TICKETS_API_PREFIX = "/api/me/support-tickets";
