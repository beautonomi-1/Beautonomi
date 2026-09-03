/**
 * Cache-Control: no-store helpers for auth-sensitive public routes.
 *
 * `/api/public/*` gets `s-maxage=30` at the edge (vercel.json + next.config headers); the
 * booking-holds, gift-card lookups and ads event endpoints are per-user / per-session and
 * must never be shared-cached. The header rules exclude those paths, and the route handlers
 * pin `no-store` themselves so the invariant holds even if the header config drifts.
 */

export const NO_STORE_CACHE_CONTROL = "private, no-store, no-cache, must-revalidate";
export const NO_STORE_VARY = "Authorization, Cookie";

/** Mutates and returns `response` with no-store cache headers. */
export function applyNoStoreHeaders<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", NO_STORE_CACHE_CONTROL);
  response.headers.set("Pragma", "no-cache");
  const existingVary = response.headers.get("Vary");
  response.headers.set(
    "Vary",
    existingVary && existingVary !== "*" ? `${existingVary}, ${NO_STORE_VARY}` : NO_STORE_VARY,
  );
  return response;
}

type RouteHandler<Args extends unknown[]> = (...args: Args) => Promise<Response> | Response;

/** Wrap a route handler so every returned response (success or error) carries no-store headers. */
export function withNoStore<Args extends unknown[]>(handler: RouteHandler<Args>): RouteHandler<Args> {
  return async (...args: Args) => {
    const response = await handler(...args);
    return applyNoStoreHeaders(response);
  };
}
