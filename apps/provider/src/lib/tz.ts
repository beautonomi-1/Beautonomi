/**
 * §Cross-app audit 2026-04 (shared utils promotion): the real
 * implementation now lives in `@beautonomi/utils` so the customer app,
 * the web API, and any future surface can import it without duplication.
 *
 * This module is kept as a zero-cost re-export so existing `@/lib/tz`
 * imports across the provider app keep working without churning every
 * call site in the same PR. New code should prefer importing directly
 * from `@beautonomi/utils`.
 */
export { buildZonedIsoForWallClock } from "@beautonomi/utils";
