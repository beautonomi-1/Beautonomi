import { format } from "date-fns";
import { dateRangeBoundsUtc, formatDateYmd } from "@/lib/dates/provider-tz";

export type DashboardRecognizedRevenueBounds = {
  endOfToday: Date;
  endOfWeek: Date;
  endOfMonth: Date;
};

/**
 * Upper bounds for ledger recognized-revenue chips (today / week / month),
 * aligned with retail takings civil-day windows in provider TZ.
 */
export function getDashboardRecognizedRevenueBounds(params: {
  timezone: string;
  businessNow: Date;
  startOfWeekLocal: Date;
}): DashboardRecognizedRevenueBounds {
  const { timezone, businessNow, startOfWeekLocal } = params;
  const todayYmd = formatDateYmd(businessNow, timezone);
  const weekStartYmd = formatDateYmd(startOfWeekLocal, timezone);
  const monthStartYmd = format(
    new Date(businessNow.getFullYear(), businessNow.getMonth(), 1),
    "yyyy-MM-dd",
  );

  const todayBounds = dateRangeBoundsUtc(todayYmd, todayYmd, timezone);
  const weekBounds = dateRangeBoundsUtc(weekStartYmd, todayYmd, timezone);
  const monthBounds = dateRangeBoundsUtc(monthStartYmd, todayYmd, timezone);

  return {
    endOfToday: new Date(todayBounds.toIso),
    endOfWeek: new Date(weekBounds.toIso),
    endOfMonth: new Date(monthBounds.toIso),
  };
}
