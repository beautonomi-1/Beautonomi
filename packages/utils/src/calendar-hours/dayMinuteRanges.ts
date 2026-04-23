/**
 * §Calendar-hours engine — compute the actual minute ranges that a weekly
 * schedule opens on a specific JS `Date`.
 *
 * Returns minute ranges `[startMin, endMin]` with `0 <= startMin < endMin <= 1440`.
 *
 * Overnight shifts (e.g. `22:00 -> 02:00`) produce one range on the opening day
 * `[1320, 1440]` and another range on the next day `[0, 120]`. Callers iterating
 * over displayed days get the correct per-day coverage without having to deal
 * with the wrap-around themselves.
 */

import {
  resolveDayHours,
  resolveWeeklyDay,
  type ResolvedDayHours,
  type WeeklyHours,
} from "./resolveDayHours";
import { getWeekdayInTimeZone } from "./timezone";

export interface MinuteRange {
  startMin: number;
  endMin: number;
}

const MINUTES_PER_DAY = 24 * 60;

function pushRange(out: MinuteRange[], startMin: number, endMin: number): void {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return;
  const s = Math.max(0, Math.min(MINUTES_PER_DAY, startMin));
  const e = Math.max(0, Math.min(MINUTES_PER_DAY, endMin));
  if (e <= s) return;
  out.push({ startMin: s, endMin: e });
}

/**
 * Expand a single resolved day schedule into minute ranges for **the day it
 * opens** and (if overnight) a tail range clamped to `[0, closeMin]` that the
 * caller should apply to the *next* day. The caller can use `dayMinuteRanges`
 * below to get the correct view for a specific `Date` without reasoning about
 * overnight themselves.
 */
export function expandResolvedDay(resolved: ResolvedDayHours | null): {
  sameDay: MinuteRange[];
  overnightTailMin: number;
} {
  if (!resolved || resolved.closed) return { sameDay: [], overnightTailMin: 0 };
  const { openMin, closeMin } = resolved;
  if (openMin === closeMin) {
    return { sameDay: [], overnightTailMin: 0 };
  }
  if (closeMin > openMin) {
    const out: MinuteRange[] = [];
    pushRange(out, openMin, closeMin);
    return { sameDay: out, overnightTailMin: 0 };
  }
  // Overnight: [openMin, 24:00) today + [00:00, closeMin) tomorrow
  const out: MinuteRange[] = [];
  pushRange(out, openMin, MINUTES_PER_DAY);
  return { sameDay: out, overnightTailMin: closeMin };
}

/**
 * Return the minute ranges that are open on the specific `date` given a weekly
 * schedule. Correctly splits overnight ranges from the *previous* day into a
 * `[0, tailMin]` range on `date`, and `date`'s own overnight close into
 * `[openMin, 1440]`.
 *
 * Pass `timeZone` (IANA, e.g. `"Africa/Johannesburg"`) to resolve the weekday
 * of `date` in the provider's business timezone. When omitted (or invalid),
 * falls back to the Date's local `getDay()` — this preserves behaviour for
 * callers that have already zoned their dates (e.g. via `date-fns-tz`).
 */
export function dayMinuteRanges(
  date: Date,
  weekly: WeeklyHours | null | undefined,
  timeZone?: string | null,
): MinuteRange[] {
  if (!weekly) return [];
  const weekday = timeZone ? getWeekdayInTimeZone(date, timeZone) : date.getDay();
  const today = resolveWeeklyDay(weekly, weekday);
  const yesterday = resolveWeeklyDay(weekly, weekday - 1);

  const out: MinuteRange[] = [];

  const expanded = expandResolvedDay(today);
  for (const r of expanded.sameDay) out.push(r);

  if (yesterday && !yesterday.closed) {
    const prevExpanded = expandResolvedDay(yesterday);
    if (prevExpanded.overnightTailMin > 0) {
      pushRange(out, 0, prevExpanded.overnightTailMin);
    }
  }

  out.sort((a, b) => a.startMin - b.startMin);
  return mergeRanges(out);
}

/** Merge overlapping or adjacent minute ranges in-place. Expects pre-sorted input. */
export function mergeRanges(ranges: MinuteRange[]): MinuteRange[] {
  if (ranges.length <= 1) return ranges.slice();
  const out: MinuteRange[] = [];
  let cur = { ...ranges[0] };
  for (let i = 1; i < ranges.length; i++) {
    const next = ranges[i];
    if (next.startMin <= cur.endMin) {
      cur.endMin = Math.max(cur.endMin, next.endMin);
    } else {
      out.push(cur);
      cur = { ...next };
    }
  }
  out.push(cur);
  return out;
}

/** Convenience: resolve a single day entry (not a weekly map) into ranges. */
export function dayMinuteRangesFromDayHours(dayHours: unknown): MinuteRange[] {
  const resolved = resolveDayHours(dayHours);
  const expanded = expandResolvedDay(resolved);
  return expanded.sameDay;
}
