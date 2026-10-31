import { formatInTimeZone } from "date-fns-tz";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";

export type StaffBookableFlagsRow = {
  is_active?: boolean | null;
  is_service_provider?: boolean | null;
  enable_in_online_booking?: boolean | null;
  bookable_from?: string | null;
};

/** Null bookable flags count as true (legacy rows). */
export function isExplicitServiceProvider(row: StaffBookableFlagsRow): boolean {
  return row.is_service_provider !== false;
}

export function isPubliclyBookableStaff(
  row: StaffBookableFlagsRow,
  providerTimeZone?: string | null,
  referenceDate?: Date,
): boolean {
  if (row.is_active === false) return false;
  if (row.is_service_provider === false) return false;
  if (row.enable_in_online_booking === false) return false;

  const from = row.bookable_from?.trim();
  if (!from) return true;

  const tz = providerTimeZone?.trim() || DEFAULT_BOOKING_DISPLAY_TIMEZONE;
  const todayYmd = formatInTimeZone(referenceDate ?? new Date(), tz, "yyyy-MM-dd");
  return from <= todayYmd;
}

export function filterStaffIdsByPublicBookability(
  staffRows: Array<{ id: string } & StaffBookableFlagsRow>,
  providerTimeZone?: string | null,
): string[] {
  return staffRows.filter((r) => isPubliclyBookableStaff(r, providerTimeZone)).map((r) => r.id);
}

/** In-house service pickers and calendar columns — hide explicit front desk only. */
export function filterStaffForServiceColumns<T extends StaffBookableFlagsRow>(rows: T[]): T[] {
  return rows.filter((r) => isExplicitServiceProvider(r));
}

/** When offering has explicit team_member_ids, narrow picker lists; empty = unrestricted. */
export function filterStaffRowsForTeamMemberIds<T extends { id: string }>(
  rows: T[],
  teamMemberIds: string[] | null | undefined,
): T[] {
  const ids = teamMemberIds?.filter(Boolean);
  if (!ids?.length) return rows;
  const allowed = new Set(ids);
  return rows.filter((r) => allowed.has(r.id));
}

/** Intersect eligible staff across multiple offerings (each with team_member_ids overlay). */
export function filterStaffForOfferingTeamLists<T extends { id: string }>(
  rows: T[],
  offerings: Array<{ team_member_ids?: string[] | null }>,
): T[] {
  let result = rows;
  for (const o of offerings) {
    const ids = o.team_member_ids?.filter(Boolean);
    if (ids && ids.length > 0) {
      result = filterStaffRowsForTeamMemberIds(result, ids);
    }
  }
  return result;
}
