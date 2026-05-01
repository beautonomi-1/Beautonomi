/**
 * Expand recurring/non-recurring provider `time_blocks` across a visible YMD range.
 *
 * Uses deterministic Gregorian calendar math (UTC civil dates) so recurrence matches
 * `YYYY-MM-DD` strings regardless of device local timezone — same semantics as
 * wall-date keys elsewhere on the provider calendar.
 */

export type ExpandableTimeBlock = {
  id: string;
  date: string;
  is_recurring?: boolean;
  is_active?: boolean;
  recurrence_rule?: unknown;
  recurring_pattern?: unknown;
};

/** Synthetic calendar ids use `${uuid}__${ymd}` for recurring instances; API rows use the UUID only. */
export function resolveTimeBlockRecordId(block: { id: string }): string {
  const s = String(block.id);
  const idx = s.indexOf("__");
  return idx === -1 ? s : s.slice(0, idx);
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseYmdParts(ymd: string): { y: number; m: number; d: number } | null {
  const m = YMD_RE.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { y, m: mo, d };
}

/** Signed whole-day difference between civil calendar dates `a` and `b` (b - a). */
export function calendarDaysBetweenYmd(a: string, b: string): number {
  const pa = parseYmdParts(a);
  const pb = parseYmdParts(b);
  if (!pa || !pb) return NaN;
  const ta = Date.UTC(pa.y, pa.m - 1, pa.d);
  const tb = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((tb - ta) / 86400000);
}

/** JS weekday 0=Sun..6=Sat for civil date `ymd` (UTC noon anchor avoids DST ambiguities). */
export function utcWeekdayFromYmd(ymd: string): number {
  const p = parseYmdParts(ymd);
  if (!p) return -1;
  return new Date(Date.UTC(p.y, p.m - 1, p.d, 12, 0, 0)).getUTCDay();
}

export function addDaysToYmd(ymd: string, delta: number): string {
  const p = parseYmdParts(ymd);
  if (!p) return ymd;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + delta));
  const y = dt.getUTCFullYear();
  const mo = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function eachYmdInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  if (!YMD_RE.test(from) || !YMD_RE.test(to)) return out;
  let cur = from;
  while (true) {
    out.push(cur);
    if (cur >= to) break;
    cur = addDaysToYmd(cur, 1);
  }
  return out;
}

type RecurrenceRule = {
  pattern?: string;
  frequency?: string;
  interval?: number;
  end_date?: string;
  occurrences?: number;
  days?: number[];
  days_of_week?: number[];
};

function ruleFromBlock(block: ExpandableTimeBlock): RecurrenceRule | null {
  const raw = block.recurring_pattern ?? block.recurrence_rule;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as RecurrenceRule;
}

/**
 * True if this calendar day should show the given time block (non-recurring: exact date;
 * recurring: pattern matches between anchor date and optional end_date).
 */
export function timeBlockAppliesOnDate(block: ExpandableTimeBlock, ymd: string): boolean {
  if (block.is_active === false) return false;

  if (!block.is_recurring) {
    return block.date === ymd;
  }

  const rule = ruleFromBlock(block);
  const rawFrequency = (rule?.frequency || rule?.pattern || "weekly").toLowerCase();
  const isBiweekly = rawFrequency === "biweekly";
  const patternKind = isBiweekly ? "weekly" : rawFrequency;

  const anchorYmd = block.date;
  if (!YMD_RE.test(anchorYmd) || !YMD_RE.test(ymd)) return false;

  const daysFromAnchor = calendarDaysBetweenYmd(anchorYmd, ymd);
  if (daysFromAnchor < 0) return false;
  if (rule?.end_date && ymd > rule.end_date) return false;

  const interval = Math.max(1, rule?.interval ?? 1);
  const explicitDays = rule?.days ?? rule?.days_of_week;

  if (patternKind === "daily") {
    return daysFromAnchor % interval === 0;
  }

  if (patternKind === "weekly") {
    const anchorDow = utcWeekdayFromYmd(anchorYmd);
    const targetDow = utcWeekdayFromYmd(ymd);
    if (anchorDow < 0 || targetDow < 0) return false;

    if (explicitDays && explicitDays.length > 0) {
      if (!explicitDays.includes(targetDow)) return false;
    } else if (targetDow !== anchorDow) {
      return false;
    }

    const weeks = Math.floor(daysFromAnchor / 7);
    const every = isBiweekly ? 2 : interval;
    return weeks % every === 0;
  }

  if (patternKind === "monthly") {
    const anchorParts = parseYmdParts(anchorYmd);
    const targetParts = parseYmdParts(ymd);
    if (!anchorParts || !targetParts) return false;
    return targetParts.d === anchorParts.d;
  }

  return false;
}

/**
 * Expand non-recurring (in-range) and recurring time blocks into one row per visible day
 * so the calendar grid can render them.
 */
export function expandTimeBlocksForCalendarRange<T extends ExpandableTimeBlock>(
  blocks: T[],
  dateFrom: string,
  dateTo: string,
): T[] {
  if (!YMD_RE.test(dateFrom) || !YMD_RE.test(dateTo)) {
    return blocks;
  }

  const days = eachYmdInclusive(dateFrom, dateTo);
  if (days.length === 0) return blocks;

  const out: T[] = [];

  for (const block of blocks) {
    for (const ymd of days) {
      if (!timeBlockAppliesOnDate(block, ymd)) continue;
      out.push({
        ...block,
        id: block.is_recurring ? `${block.id}__${ymd}` : block.id,
        date: ymd,
      });
    }
  }

  return out;
}
