import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enrichBookingLifecycleFields,
  mapProviderSettingsFromRow,
} from "@/lib/bookings/lifecycle-booking-enrichment";

export type CloseOutBookingRow = Record<string, unknown> & {
  id: string;
  scheduled_at: string;
  status: string;
  location_type?: string | null;
  current_stage?: string | null;
  staff_id?: string | null;
  booking_services?: Array<{
    scheduled_end_at?: string | null;
    duration_minutes?: number | null;
    staff_id?: string | null;
    offerings?: { duration_minutes?: number | null } | null;
  }> | null;
};

export const BULK_COMPLETE_ELIGIBLE_STATUSES = ["in_progress", "checked_in"] as const;

/** Canonical provider portal / email deep link into the close-out queue. */
export const CLOSE_OUT_BOOKINGS_QUERY_VALUE = "close_out";
export const CLOSE_OUT_BOOKINGS_PATH = `/provider/bookings?status=${CLOSE_OUT_BOOKINGS_QUERY_VALUE}`;
/** Owner-only digest after leftovers have been open this many calendar days. */
export const CLOSEOUT_ESCALATION_OWNER_ONLY_AFTER_DAYS = 3;

export function isCloseOutBookingsDeepLink(searchParams: {
  get: (key: string) => string | null;
}): boolean {
  const status = searchParams.get("status");
  const filter = searchParams.get("filter");
  return status === CLOSE_OUT_BOOKINGS_QUERY_VALUE || filter === CLOSE_OUT_BOOKINGS_QUERY_VALUE;
}

export function closeOutReminderTitle(ownerOnly: boolean): string {
  return ownerOnly
    ? `Appointments open for over ${CLOSEOUT_ESCALATION_OWNER_ONLY_AFTER_DAYS} days`
    : "Unclosed appointments";
}

export function isBulkCompleteEligibleStatus(status: string | null | undefined): boolean {
  return (BULK_COMPLETE_ELIGIBLE_STATUSES as readonly string[]).includes(String(status ?? ""));
}

export async function loadProviderLifecycleRow(
  admin: SupabaseClient,
  providerId: string,
) {
  const { data } = await admin
    .from("providers")
    .select(
      "confirmation_sla_hours, unconfirmed_expire_hours_before_slot, closeout_grace_minutes_salon, closeout_grace_minutes_at_home, late_arrival_grace_minutes, timezone",
    )
    .eq("id", providerId)
    .maybeSingle();
  return data;
}

export function enrichCloseOutRows(
  rows: CloseOutBookingRow[],
  providerSettingsRow?: Awaited<ReturnType<typeof loadProviderLifecycleRow>>,
  now = new Date(),
) {
  const settings = mapProviderSettingsFromRow(providerSettingsRow ?? undefined);
  const enriched: Array<CloseOutBookingRow & ReturnType<typeof enrichBookingLifecycleFields>> = [];

  for (const row of rows) {
    const lifecycle = enrichBookingLifecycleFields(row, settings, now);
    if (lifecycle.needs_close_out) {
      enriched.push({ ...row, ...lifecycle });
    }
  }

  return enriched;
}

export function summarizeCloseOutRows(
  rows: Array<CloseOutBookingRow & { needs_close_out?: boolean }>,
  timezone = "Africa/Johannesburg",
) {
  const now = new Date();
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  let today = 0;
  let older = 0;
  const byStaff: Record<string, number> = {};

  for (const row of rows) {
    if (!row.needs_close_out) continue;
    const scheduledKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(String(row.scheduled_at)));

    if (scheduledKey === todayKey) today += 1;
    else older += 1;

    const staffId =
      (row.staff_id as string | null | undefined) ??
      row.booking_services?.[0]?.staff_id ??
      "unassigned";
    byStaff[staffId] = (byStaff[staffId] ?? 0) + 1;
  }

  return { today, older, by_staff: byStaff, total: today + older };
}
