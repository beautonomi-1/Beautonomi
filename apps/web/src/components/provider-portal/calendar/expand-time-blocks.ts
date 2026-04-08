import { eachDayOfInterval, format, getDay, parseISO } from "date-fns";
import type { TimeBlock } from "@/lib/provider-portal/types";

/** Synthetic calendar ids use `${uuid}__${ymd}` for recurring instances; API rows use the UUID only. */
export function resolveTimeBlockRecordId(block: Pick<TimeBlock, "id">): string {
  const s = String(block.id);
  const idx = s.indexOf("__");
  return idx === -1 ? s : s.slice(0, idx);
}

type RecurrenceRule = {
  pattern?: string;
  interval?: number;
  end_date?: string;
  occurrences?: number;
};

function ruleFromBlock(block: TimeBlock): RecurrenceRule | null {
  const raw = block.recurrence_rule;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as RecurrenceRule;
}

/**
 * True if this calendar day should show the given time block (non-recurring: exact date;
 * recurring: pattern matches between anchor date and optional end_date).
 */
export function timeBlockAppliesOnDate(block: TimeBlock, ymd: string): boolean {
  if (block.is_active === false) return false;

  if (!block.is_recurring) {
    return block.date === ymd;
  }

  const rule = ruleFromBlock(block);
  const pattern = (rule?.pattern || "weekly").toLowerCase();
  const anchor = parseISO(`${block.date}T12:00:00`);
  const target = parseISO(`${ymd}T12:00:00`);
  if (Number.isNaN(anchor.getTime()) || Number.isNaN(target.getTime())) return false;
  if (target < anchor) return false;
  if (rule?.end_date && ymd > rule.end_date) return false;

  const interval = Math.max(1, rule?.interval ?? 1);

  if (pattern === "daily") {
    const daysDiff = Math.floor((target.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000));
    return daysDiff % interval === 0;
  }

  if (pattern === "weekly" || pattern === "biweekly") {
    if (getDay(target) !== getDay(anchor)) return false;
    const weeks = Math.floor((target.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const every = pattern === "biweekly" ? 2 : interval;
    return weeks % every === 0;
  }

  if (pattern === "monthly") {
    return target.getDate() === anchor.getDate();
  }

  return false;
}

/**
 * Expand non-recurring (in-range) and recurring time blocks into one row per visible day
 * so the calendar grid can render them.
 */
export function expandTimeBlocksForCalendarRange(
  blocks: TimeBlock[],
  dateFrom: string,
  dateTo: string,
): TimeBlock[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return blocks;
  }

  const start = parseISO(`${dateFrom}T12:00:00`);
  const end = parseISO(`${dateTo}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return blocks;

  const days = eachDayOfInterval({ start, end });
  const out: TimeBlock[] = [];

  for (const block of blocks) {
    for (const day of days) {
      const ymd = format(day, "yyyy-MM-dd");
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
