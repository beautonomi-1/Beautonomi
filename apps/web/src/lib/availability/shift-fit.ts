/**
 * Shared shift-fit logic used by BOTH the availability listing engine
 * (`calculate-slots.ts`) and the booking validation guard (`validate-booking.ts`).
 *
 * Keeping a single implementation here ensures that the two engines always
 * agree on what "fits a shift" means — especially for overnight shifts
 * (end_time < start_time) and midnight-closing shifts (end_time = "00:00").
 *
 * Previously `validate-booking.ts` had an inline `segmentFitsAtLeastOneShift`
 * that only handled the normal case (`closeMin > openMin`), silently rejecting
 * any slot in an overnight shift even though the listing engine showed it as
 * available. This file is the single source of truth for both.
 */

/** Parse "HH:MM" or "HH:MM:SS" into total minutes since midnight. */
export function shiftWallTimeToMinutes(t: string): number {
  const parts = String(t).split(":").map((x) => parseInt(x, 10));
  const h = Number.isFinite(parts[0]) ? parts[0] : 0;
  const m = Number.isFinite(parts[1]) ? parts[1] : 0;
  return h * 60 + m;
}

/**
 * Decompose a shift into contiguous minute-ranges on the same day (or across
 * midnight for overnight shifts).
 *
 * - Normal shift (end > start): single range `[start, end]`.
 * - Overnight shift (end < start): two ranges — `[start, 1440]` and `[0, end]`
 *   with a `dayOffset: 1` on the second range so callers know it crosses into
 *   the next calendar day.
 * - Zero-length shift (end === start): empty — no slots fit.
 */
export function shiftMinuteRanges(
  shift: { start_time: string; end_time: string },
): Array<{ start: number; end: number; dayOffset: number }> {
  const start = shiftWallTimeToMinutes(shift.start_time.substring(0, 5));
  const end = shiftWallTimeToMinutes(shift.end_time.substring(0, 5));
  if (end > start) return [{ start, end, dayOffset: 0 }];
  if (end < start) {
    return [
      { start, end: 24 * 60, dayOffset: 0 },
      { start: 0, end, dayOffset: 1 },
    ];
  }
  // end === start: zero-length, nothing fits
  return [];
}

/**
 * Returns `true` when the half-open interval `[segStartMin, segEndMin)`
 * fits entirely within at least one range of any of the given shifts.
 *
 * This correctly handles:
 *  - Normal shifts         (end_time > start_time)
 *  - Overnight shifts      (end_time < start_time, e.g. 18:00–02:00)
 *  - Midnight-close shifts (end_time = "00:00" -> treated as overnight)
 *
 * The segment is expressed as **provider-local wall-clock minutes** since
 * midnight (same coordinate system as `shift_time` columns). For overnight
 * ranges the segment start must be >= range.start (same day) OR the segment
 * end must be <= range.end and range.dayOffset === 1 (next day wrap-around).
 *
 * Callers in `validate-booking.ts` always operate in provider-local minutes
 * obtained via `formatInTimeZone(instant, providerTz, "HH:mm")`, so the
 * coordinate system matches.
 */
export function segmentFitsAnyShift(
  segStartMin: number,
  segEndMin: number,
  shifts: { start_time: string; end_time: string }[],
): boolean {
  for (const shift of shifts) {
    const ranges = shiftMinuteRanges(shift);
    for (const range of ranges) {
      if (range.dayOffset === 0) {
        // Same-day range: segment must NOT cross midnight (segEndMin >= segStartMin)
        // and must fit entirely within [range.start, range.end].
        // If segEndMin < segStartMin the segment crosses midnight and belongs to the
        // overnight (dayOffset===1) path below — accepting it here would wrongly
        // match e.g. a 09:00-00:00 shift for a 23:30-00:30 booking.
        if (
          segEndMin >= segStartMin &&
          segStartMin >= range.start &&
          segEndMin <= range.end
        ) {
          return true;
        }
      } else {
        // dayOffset === 1: wrap-around portion of an overnight shift [0, range.end].
        //
        // Two valid cases:
        //
        // A) Midnight-crossing segment (segEndMin < segStartMin):
        //    Start is on day-0 (must fall inside the companion day-0 range of this
        //    same overnight shift).  End is on day-1 (must be <= range.end).
        //
        // B) Pure day-1 slot (segment starts AND ends in [0, range.end]):
        //    Covers bookings that start after midnight inside the overnight shift.
        if (segEndMin < segStartMin) {
          // Case A: locate this shift's own day-0 range to validate the start.
          const day0Range = ranges.find((r) => r.dayOffset === 0);
          if (
            day0Range &&
            segStartMin >= day0Range.start &&
            segEndMin <= range.end
          ) {
            return true;
          }
        } else {
          // Case B: pure next-day slot within [0, range.end]
          if (segStartMin >= 0 && segEndMin <= range.end) return true;
        }
      }
    }
  }
  return false;
}
