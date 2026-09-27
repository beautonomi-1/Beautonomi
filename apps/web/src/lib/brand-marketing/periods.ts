export type PeriodPreset =
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "this_year"
  | "last_7"
  | "last_30"
  | "last_90"
  | "custom";

export type PeriodComparison = "previous_period" | "previous_quarter" | "same_period_last_year";

export type UtcPeriod = { start: Date; end: Date; label: string };

function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function utcEndOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export function fiscalQuarterBounds(
  ref: Date,
  fiscalStartMonth: number,
): { start: Date; end: Date; quarter: number; year: number } {
  const m = ref.getUTCMonth() + 1;
  const y = ref.getUTCFullYear();
  const offset = ((m - fiscalStartMonth + 12) % 12) + 1;
  const q = Math.ceil(offset / 3);
  const startMonth = ((fiscalStartMonth - 1 + (q - 1) * 3) % 12) + 1;
  let startYear = y;
  if (startMonth > m) startYear = y - 1;
  if (fiscalStartMonth > m && q === 4) startYear = y - 1;
  const start = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const endMonth = startMonth + 2;
  const end = utcEndOfDay(new Date(Date.UTC(startYear, endMonth, 0)));
  return { start, end, quarter: q, year: startYear };
}

export function resolveUtcPeriod(
  preset: PeriodPreset,
  customStart?: string,
  customEnd?: string,
  now = new Date(),
): UtcPeriod {
  const today = utcStartOfDay(now);
  switch (preset) {
    case "last_7": {
      const end = utcEndOfDay(today);
      const start = utcStartOfDay(new Date(today.getTime() - 6 * 86400000));
      return { start, end, label: "Last 7 days (UTC)" };
    }
    case "last_30": {
      const end = utcEndOfDay(today);
      const start = utcStartOfDay(new Date(today.getTime() - 29 * 86400000));
      return { start, end, label: "Last 30 days (UTC)" };
    }
    case "last_90": {
      const end = utcEndOfDay(today);
      const start = utcStartOfDay(new Date(today.getTime() - 89 * 86400000));
      return { start, end, label: "Last 90 days (UTC)" };
    }
    case "this_month": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const end = utcEndOfDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)));
      return { start, end, label: "This month (UTC)" };
    }
    case "this_year": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      const end = utcEndOfDay(new Date(Date.UTC(today.getUTCFullYear(), 11, 31)));
      return { start, end, label: "This year (UTC)" };
    }
    case "this_quarter": {
      const { start, end } = fiscalQuarterBounds(today, 1);
      return { start, end, label: "This quarter (UTC)" };
    }
    case "this_week": {
      const day = today.getUTCDay();
      const diff = day === 0 ? 6 : day - 1;
      const start = utcStartOfDay(new Date(today.getTime() - diff * 86400000));
      const end = utcEndOfDay(new Date(start.getTime() + 6 * 86400000));
      return { start, end, label: "This week (UTC)" };
    }
    case "custom":
    default: {
      const start = customStart ? utcStartOfDay(new Date(customStart)) : today;
      const end = customEnd ? utcEndOfDay(new Date(customEnd)) : utcEndOfDay(today);
      return { start, end, label: "Custom (UTC)" };
    }
  }
}

export function comparisonPeriod(
  current: UtcPeriod,
  mode: PeriodComparison,
  fiscalStartMonth = 1,
): UtcPeriod | null {
  const len = current.end.getTime() - current.start.getTime();
  if (mode === "previous_period") {
    const end = new Date(current.start.getTime() - 1);
    const start = new Date(end.getTime() - len);
    return { start, end, label: "Previous period (UTC)" };
  }
  if (mode === "previous_quarter") {
    const mid = new Date((current.start.getTime() + current.end.getTime()) / 2);
    const q = fiscalQuarterBounds(mid, fiscalStartMonth);
    const prevEnd = new Date(q.start.getTime() - 1);
    const prevQ = fiscalQuarterBounds(prevEnd, fiscalStartMonth);
    return { start: prevQ.start, end: prevQ.end, label: "Previous quarter (UTC)" };
  }
  if (mode === "same_period_last_year") {
    const start = new Date(current.start);
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    const end = new Date(current.end);
    end.setUTCFullYear(end.getUTCFullYear() - 1);
    return { start, end, label: "Same period last year (UTC)" };
  }
  return null;
}
