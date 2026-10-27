import {
  endOfMonth,
  format,
  startOfMonth,
  subDays,
  startOfWeek,
  endOfWeek,
} from "date-fns";

export type PayPeriodTypePreset =
  | "weekly"
  | "biweekly"
  | "semi_monthly"
  | "monthly"
  | "custom";

/** Inclusive calendar bounds for a preset type from an anchor date (end of period). */
export function boundsForPayPeriodPreset(
  periodType: PayPeriodTypePreset,
  anchor: Date,
): { start: string; end: string } {
  const end = anchor;
  if (periodType === "monthly") {
    return {
      start: format(startOfMonth(end), "yyyy-MM-dd"),
      end: format(endOfMonth(end), "yyyy-MM-dd"),
    };
  }
  if (periodType === "weekly") {
    return {
      start: format(startOfWeek(end, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      end: format(endOfWeek(end, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  }
  if (periodType === "biweekly") {
    return {
      start: format(subDays(end, 13), "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
    };
  }
  if (periodType === "semi_monthly") {
    const day = end.getDate();
    if (day <= 15) {
      return {
        start: format(new Date(end.getFullYear(), end.getMonth(), 1), "yyyy-MM-dd"),
        end: format(new Date(end.getFullYear(), end.getMonth(), 15), "yyyy-MM-dd"),
      };
    }
    return {
      start: format(new Date(end.getFullYear(), end.getMonth(), 16), "yyyy-MM-dd"),
      end: format(endOfMonth(end), "yyyy-MM-dd"),
    };
  }
  return {
    start: format(subDays(end, 6), "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
  };
}
