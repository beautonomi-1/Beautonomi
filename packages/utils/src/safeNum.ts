/**
 * §Cross-app audit 2026-04 (shared utils promotion): `safeNum` used to
 * live as a local `useCallback` inside
 * `apps/provider/app/(app)/(tabs)/more/bookings/new.tsx`, which meant
 * the customer app never got the same numeric-safety guarantee. The
 * helper is tiny but load-bearing: it stops `NaN` or "" inputs from
 * silently propagating into pricing math, tax calculations, and API
 * payloads (rendering "R NaN" in the UI or 422-ing on the server).
 *
 * Promoting to `@beautonomi/utils` means:
 *   - Web API can use the same coercion for user-submitted prices.
 *   - Customer RN app can reuse it in cart / checkout math.
 *   - Provider RN app imports the same function instead of its own copy,
 *     so a future edge-case fix (e.g. accepting `"1,99"` locales) lands
 *     in exactly one place.
 */
export function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
