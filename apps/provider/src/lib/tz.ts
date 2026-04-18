/**
 * §Release-audit 2026-04: small timezone helpers so the provider app can
 * reason about wall-clock times in the provider's IANA zone regardless of
 * the device's own timezone. We deliberately avoid pulling in `date-fns-tz`
 * to keep the Expo bundle lean — `Intl.DateTimeFormat` with a `timeZone`
 * option is available on every supported RN/iOS/Android runtime.
 *
 * The pattern we use ("offset-probe") converts a naive date+time to a UTC
 * instant by:
 *  1. creating a candidate `Date` from the wall clock at UTC,
 *  2. asking `Intl` to format that instant *as if* it were in the target
 *     zone, and
 *  3. subtracting the drift — this gives us the actual UTC offset at that
 *     wall clock, which we fold back into the candidate.
 * It handles DST transitions correctly because the Intl formatter knows
 * the zone's rules for that specific instant.
 */

/**
 * §Launch-audit 2026-04-18: imported from the shared utils package so
 * the web API, the customer RN app, and the provider RN app all agree
 * on how offset-style provider timezones (e.g. `"GMT+2"`) are
 * canonicalised. Database-level fix-up lives in supabase migration 511.
 */
import { normalizeProviderTimezone } from "@beautonomi/utils";

/** Returns the offset (in minutes, East-positive) of `instant` in `zone`. */
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
  // Intl uses "24" for midnight — normalise.
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

/**
 * Format a signed offset in ±HH:MM form.
 */
function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/**
 * Build an ISO-8601 timestamp like `2026-04-17T14:30:00+02:00` representing
 * the wall-clock `dateStr` + `timeStr` in the provider's IANA timezone.
 *
 * Falls back to the device's local timezone when `zone` is missing,
 * preserving the pre-audit behaviour for tenants that don't yet expose a
 * timezone on the provider record.
 */
export function buildZonedIsoForWallClock(
  dateStr: string,
  timeStr: string,
  zone: string | null | undefined,
): string {
  const [hh, mm] = timeStr.split(":").map((v) => v.padStart(2, "0"));
  const safeTime = `${hh ?? "00"}:${mm ?? "00"}:00`;
  // §Launch-audit 2026-04-18: canonicalise offset-style strings so the
  // Intl offset-probe below succeeds on legacy provider rows that
  // haven't yet been migrated (see supabase migration 511).
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
