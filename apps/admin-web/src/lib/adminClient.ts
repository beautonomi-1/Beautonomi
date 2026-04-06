import { createAdminApiClient } from "@beautonomi/admin-api-client";

/**
 * Relative `/api` — use Vite dev proxy to Next (see vite.config.ts).
 *
 * **Response shapes:** Most `successResponse` routes unwrap to `T` via `{ data: T }`.
 * A few routes return a top-level object without `data` (e.g. support-tickets list) — `getJson` still returns the parsed body.
 * Use **`getRawJson`** when the handler returns `{ data, meta }` at the top level and both are needed (payouts, audit-logs).
 * Prefer `adminQueryKeys` + typed `getJson<T>`; add Zod in `@beautonomi/admin-api-client` when a contract is wave-gated.
 */
export const adminApi = createAdminApiClient({ baseUrl: "" });
