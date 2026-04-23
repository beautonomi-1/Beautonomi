/**
 * §Cross-app audit 2026-04 (shared utils promotion): promoted from
 * `apps/provider/src/lib/tz.ts` so the customer app (and any future web
 * client that needs to build a wall-clock ISO in a non-device zone) can
 * import the same battle-tested implementation instead of carrying a
 * re-implementation with subtle DST bugs.
 *
 * Converts a naive `YYYY-MM-DD` + `HH:MM` in the provider's IANA
 * timezone to an ISO-8601 instant like `2026-04-17T14:30:00+02:00`.
 *
 * We deliberately avoid pulling in `date-fns-tz` here to keep the Expo
 * bundle lean — `Intl.DateTimeFormat` with a `timeZone` option is
 * available on every supported RN/iOS/Android runtime, and the
 * "offset-probe" pattern below handles DST transitions correctly because
 * the Intl formatter knows the zone's rules at the specific instant.
 *
 * Steps:
 *   1. Build a candidate `Date` from the wall clock at UTC.
 *   2. Ask `Intl` to format that instant *as if* it were in the target
 *      zone to discover the zone's offset at that wall clock.
 *   3. Subtract the drift — this gives the real UTC instant.
 *   4. Recompute the offset at the real instant (DST-safe).
 */

import { normalizeProviderTimezone } from "./dates";

/** Offset of `instant` in `zone`, in minutes (East-positive). */
function getZoneOffsetMinutes(instant: Date, zone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const lookup: Record<string, string> = {};
  for (const p of parts) lookup[p.type] = p.value;
  // Intl formats midnight as "24" on some platforms — normalise to "00".
  if (lookup.hour === "24") lookup.hour = "00";
  const asUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour),
    Number(lookup.minute),
    Number(lookup.second),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/** Format a signed offset in ±HH:MM form. */
function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/**
 * Build an ISO-8601 timestamp like `2026-04-17T14:30:00+02:00`
 * representing the wall-clock `dateStr` + `timeStr` in the provider's
 * IANA timezone.
 *
 * Falls back to the device's local timezone when `zone` is missing or
 * invalid at runtime, preserving the pre-audit behaviour for tenants
 * that don't yet expose a timezone on the provider record.
 */
export function buildZonedIsoForWallClock(
  dateStr: string,
  timeStr: string,
  zone: string | null | undefined,
): string {
  const [hh, mm] = timeStr.split(":").map((v) => v.padStart(2, "0"));
  const safeTime = `${hh ?? "00"}:${mm ?? "00"}:00`;
  // Canonicalise offset-style strings (e.g. "GMT+2") so the Intl
  // offset-probe below succeeds on legacy provider rows that haven't
  // been migrated yet. See supabase migration 511.
  const canonicalZone = normalizeProviderTimezone(zone);
  if (!canonicalZone) {
    const naive = new Date(`${dateStr}T${safeTime}`);
    // getTimezoneOffset returns minutes-West; flip to minutes-East.
    const offset = -naive.getTimezoneOffset();
    return `${dateStr}T${safeTime}${formatOffset(offset)}`;
  }

  try {
    // Candidate: interpret the wall clock as if it were UTC.
    const candidate = new Date(`${dateStr}T${safeTime}Z`);
    const offsetMinutes = getZoneOffsetMinutes(candidate, canonicalZone);
    // The true UTC instant is candidate - offset.
    const trueInstantMs = candidate.getTime() - offsetMinutes * 60_000;
    const trueInstant = new Date(trueInstantMs);
    // Now compute the offset *at that instant* (in case of DST edge cases).
    const realOffset = getZoneOffsetMinutes(trueInstant, canonicalZone);
    return `${dateStr}T${safeTime}${formatOffset(realOffset)}`;
  } catch {
    // Fall back to device local if the zone is invalid at runtime.
    const naive = new Date(`${dateStr}T${safeTime}`);
    const offset = -naive.getTimezoneOffset();
    return `${dateStr}T${safeTime}${formatOffset(offset)}`;
  }
}
