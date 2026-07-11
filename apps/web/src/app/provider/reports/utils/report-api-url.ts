import { format } from "date-fns";

/**
 * Appends `location_id` to provider report API URLs for parity with the
 * global provider portal location filter.
 */
export function addLocationIdToUrl(
  path: string,
  locationId: string | null | undefined
): string {
  if (!locationId) return path;
  const hasQuery = path.includes("?");
  return `${path}${hasQuery ? "&" : "?"}location_id=${encodeURIComponent(locationId)}`;
}

export type ReportDateRange = {
  from?: Date;
  to?: Date;
};

/**
 * Appends inclusive civil `from`/`to` as `YYYY-MM-DD` for provider report APIs.
 * Matches `reportDateRangeFromParams` on the server (provider timezone bounds).
 */
export function appendReportDateParams(
  params: URLSearchParams,
  dateRange: ReportDateRange
): void {
  if (dateRange.from) {
    params.set("from", format(dateRange.from, "yyyy-MM-dd"));
  }
  if (dateRange.to) {
    params.set("to", format(dateRange.to, "yyyy-MM-dd"));
  }
}
