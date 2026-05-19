/**
 * Date formatting utilities
 */

import { format, formatDistanceToNow, parseISO } from "date-fns";

export function formatDate(date: string | Date, fmt = "PPP"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, fmt);
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * `Date` values become ISO strings when round-tripped through JSON (e.g. localStorage).
 * Use this before calling `Date` instance methods in UI.
 */
export function coerceSelectedDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Calendar date in the **device / runtime local** timezone (`YYYY-MM-DD`).
 * Use for availability and waitlist `date` query params when the user picks a day on a calendar.
 * Do **not** use `date.toISOString().split("T")[0]` for that — it is the **UTC** calendar date and
 * can be wrong for users ahead of UTC (e.g. evening in Johannesburg maps to previous UTC day).
 */
export function formatLocalDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * §Booking-slot-audit 2026-05: customer booking flows need to anchor the
 * date strip and `date=` query params to the **provider business day**, not
 * the device-local day. Otherwise a customer in a far-away timezone (e.g.
 * Asia at 1am with a SAST provider) requests the wrong salon business date
 * and sees "missing" or "extra" early-morning slots.
 *
 * This helper returns a **device-local `Date` whose Y/M/D matches the
 * provider's business day** for `(now + offsetDays)`. Because the returned
 * Date's `.getFullYear()`, `.getMonth()`, `.getDate()`, `.getDay()` all
 * return values for the provider business day:
 *
 *  - `formatLocalDateYYYYMMDD(d)` returns the provider business `YYYY-MM-DD`
 *    so the availability API receives the salon's date.
 *  - Existing display code (date strip, month grid, weekday labels) keeps
 *    working unchanged because the Date "looks like" device-local on that
 *    date.
 *
 * When `tz` is missing or unparseable, falls back to device-local "today"
 * (existing behaviour), so providers without a configured timezone are
 * unaffected.
 */
export function startOfBusinessDayLocalDate(
  tz: string | null | undefined,
  offsetDays = 0,
): Date {
  const normalized = normalizeProviderTimezone(tz);
  if (!normalized) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
    return d;
  }
  try {
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: normalized,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!match) throw new Error("Bad Intl date output");
    const y = Number(match[1]);
    const mo = Number(match[2]);
    const d = Number(match[3]);
    const out = new Date(y, mo - 1, d);
    if (offsetDays !== 0) out.setDate(out.getDate() + offsetDays);
    return out;
  } catch {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
    return d;
  }
}

/**
 * §Booking-slot-audit 2026-05: format a Date as `YYYY-MM-DD` using the
 * provider business timezone when known. When `tz` is missing or invalid,
 * falls back to {@link formatLocalDateYYYYMMDD} (device-local).
 *
 * Use at the API boundary (`date=` query param) so the salon receives the
 * date the customer actually intends to book, even when their device is in
 * a different timezone.
 */
export function formatBusinessDayYYYYMMDD(d: Date, tz: string | null | undefined): string {
  const normalized = normalizeProviderTimezone(tz);
  if (!normalized) return formatLocalDateYYYYMMDD(d);
  try {
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: normalized,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
    return formatLocalDateYYYYMMDD(d);
  } catch {
    return formatLocalDateYYYYMMDD(d);
  }
}

/**
 * Normalizes any `Date`-parsable value (including ISO strings with `Z` or `±hh:mm`) to UTC ISO 8601 (`…Z`).
 * Use for booking/hold payloads that must satisfy `z.string().datetime()` (RFC 3339).
 */
export function toIsoUtcTimestamp(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date/time");
  }
  return d.toISOString();
}

/**
 * §Launch-audit 2026-04-18: shared provider-timezone normaliser used by
 * the web API, the customer RN app, and the provider RN app.
 *
 * Some older `providers.timezone` rows store offset-style strings such
 * as `"GMT+2"`, `"UTC-05"`, or `"+02:00"`. Passing those directly to
 * `Intl.DateTimeFormat({ timeZone })` throws a `RangeError`, which
 * surfaced as 500s on `/api/availability`, broken notification dates,
 * and wrong-looking clocks in the mobile apps. This helper:
 *
 *   1. accepts valid IANA identifiers (e.g. `"Africa/Johannesburg"`)
 *      verbatim,
 *   2. converts common offset forms to the POSIX `Etc/GMT±N`
 *      equivalent — note the sign flip: `GMT+2` → `Etc/GMT-2`, which
 *      is two hours *ahead* of UTC (the user's "GMT+2"),
 *   3. rejects sub-hour offsets (e.g. `"+05:30"`) because the `Etc`
 *      zones can't express them — callers should fix the data instead
 *      of silently rounding,
 *   4. returns `null` whenever the input can't be validated by round-
 *      tripping through `Intl.DateTimeFormat`, so callers can decide
 *      their own fallback (UTC, regional default, etc.).
 *
 * The database-side fix-up is in `supabase/migrations/511_normalize_provider_timezones.sql`.
 */
export function normalizeProviderTimezone(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const attempt = (tz: string): string | null => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      return null;
    }
  };

  const direct = attempt(trimmed);
  if (direct) return direct;

  const match = trimmed
    .toUpperCase()
    .replace(/\s+/g, "")
    .match(/^(?:GMT|UTC)?([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;
  const sign = match[1];
  const hours = parseInt(match[2], 10);
  const mins = match[3] ? parseInt(match[3], 10) : 0;
  if (!Number.isFinite(hours) || hours > 14 || mins >= 60) return null;
  if (mins !== 0) return null;
  const flipped = sign === "+" ? "-" : "+";
  return attempt(`Etc/GMT${flipped}${hours}`);
}
