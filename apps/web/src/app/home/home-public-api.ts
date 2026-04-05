/**
 * Client-side reads to GET /api/public/home.
 * Sections previously used 10s while the route allows maxDuration 30s — that caused false timeouts after SSR.
 */
export const PUBLIC_HOME_CLIENT_TIMEOUT_MS = 28_000;
