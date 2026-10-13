/**
 * Staff daily / weekly schedule summaries (provider_staff.notification_settings).
 * Invoked from the send-reminders cron alongside appointment reminders.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { effectiveStaffNotificationSettings } from "@/lib/notifications/staff-notification-settings-sync";
import { sendToUser } from "@/lib/notifications/onesignal";

const SUMMARY_SEND_LOCAL_HOUR = 7;

function bookingAssignedToStaff(
  booking: {
    staff_id?: string | null;
    booking_services?: Array<{ staff_id?: string | null } | null> | null;
  },
  staffId: string,
): boolean {
  if (booking.staff_id === staffId) return true;
  for (const row of booking.booking_services ?? []) {
    if (row?.staff_id === staffId) return true;
  }
  return false;
}

function localHourAndDateKey(now: Date, timezone: string): { hour: number; dateKey: string; weekday: number } {
  const tz = timezone.trim() || "Africa/Johannesburg";
  const hour = Number.parseInt(formatInTimeZone(now, tz, "H"), 10);
  const dateKey = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const weekday = Number.parseInt(formatInTimeZone(now, tz, "i"), 10);
  return { hour, dateKey, weekday };
}

function dayBoundsUtc(dateKey: string, timezone: string): { start: string; end: string } {
  const tz = timezone.trim() || "Africa/Johannesburg";
  const start = fromZonedTime(`${dateKey} 00:00:00`, tz);
  const end = fromZonedTime(`${dateKey} 23:59:59.999`, tz);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function alreadySentSummary(
  userId: string,
  dedupeKey: string,
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "staff_schedule_summary")
    .contains("data", { summary_key: dedupeKey })
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function sendStaffScheduleSummaries(): Promise<{
  dailySent: number;
  weeklySent: number;
}> {
  const admin = getSupabaseAdmin();
  const now = new Date();
  let dailySent = 0;
  let weeklySent = 0;

  const { data: staffRows, error } = await admin
    .from("provider_staff")
    .select(
      `
      id,
      user_id,
      provider_id,
      notification_settings,
      email_notifications_enabled,
      sms_notifications_enabled,
      desktop_notifications_enabled,
      providers!inner ( id, business_name, timezone, tenant_id )
    `,
    )
    .eq("is_active", true)
    .not("user_id", "is", null);

  if (error) {
    console.error("[staff-schedule-summaries] staff query failed", error);
    return { dailySent, weeklySent };
  }

  type Row = {
    id: string;
    user_id: string;
    provider_id: string;
    notification_settings?: unknown;
    email_notifications_enabled?: boolean | null;
    providers: { business_name?: string; timezone?: string | null; tenant_id?: string | null };
  };

  for (const row of (staffRows ?? []) as Row[]) {
    const settings = effectiveStaffNotificationSettings(row);
    const tz = row.providers?.timezone || "Africa/Johannesburg";
    const { hour, dateKey, weekday } = localHourAndDateKey(now, tz);
    if (hour !== SUMMARY_SEND_LOCAL_HOUR) continue;

    const { start, end } = dayBoundsUtc(dateKey, tz);

    if (settings.daily_schedule !== false) {
      const dedupeKey = `daily_${dateKey}_${row.id}`;
      if (!(await alreadySentSummary(row.user_id, dedupeKey))) {
        const sent = await sendSummaryForRange(row, tz, start, end, "daily", dedupeKey, dateKey);
        if (sent) dailySent += 1;
      }
    }

    if (settings.weekly_schedule === true && weekday === 1) {
      const weekKey = formatInTimeZone(now, tz, "yyyy-'W'II");
      const dedupeKey = `weekly_${weekKey}_${row.id}`;
      if (!(await alreadySentSummary(row.user_id, dedupeKey))) {
        const weekEndDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const weekEndKey = formatInTimeZone(weekEndDate, tz, "yyyy-MM-dd");
        const weekEnd = dayBoundsUtc(weekEndKey, tz).end;
        const sent = await sendSummaryForRange(
          row,
          tz,
          start,
          weekEnd,
          "weekly",
          dedupeKey,
          weekKey,
        );
        if (sent) weeklySent += 1;
      }
    }
  }

  return { dailySent, weeklySent };
}

async function sendSummaryForRange(
  row: {
    id: string;
    user_id: string;
    provider_id: string;
    providers: { business_name?: string; tenant_id?: string | null };
  },
  tz: string,
  rangeStart: string,
  rangeEnd: string,
  mode: "daily" | "weekly",
  dedupeKey: string,
  label: string,
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      `
      id,
      scheduled_at,
      staff_id,
      booking_services ( staff_id, offering:offerings!inner ( title ) )
    `,
    )
    .eq("provider_id", row.provider_id)
    .eq("status", "confirmed")
    .gte("scheduled_at", rangeStart)
    .lte("scheduled_at", rangeEnd)
    .is("cancelled_at", null);

  const mine = (bookings ?? []).filter((b) => bookingAssignedToStaff(b as never, row.id));
  const count = mine.length;
  const businessName = row.providers?.business_name || "Your salon";
  const title =
    mode === "daily"
      ? `Today's schedule (${label})`
      : `This week's schedule (${label})`;
  const message =
    count === 0
      ? mode === "daily"
        ? `No confirmed appointments today at ${businessName}.`
        : `No confirmed appointments this week at ${businessName}.`
      : mode === "daily"
        ? `You have ${count} appointment${count === 1 ? "" : "s"} today at ${businessName}.`
        : `You have ${count} appointment${count === 1 ? "" : "s"} this week at ${businessName}.`;

  const { insertNotification } = await import("@/lib/notifications/insert-notification");
  await insertNotification({
    user_id: row.user_id,
    type: "staff_schedule_summary",
    title,
    message,
    data: { summary_key: dedupeKey, mode, appointment_count: count },
    action_url: "/provider/calendar",
  });

  await sendToUser(
    row.user_id,
    {
      title,
      message,
      type: "staff_schedule_summary",
      data: { template_key: "provider_schedule_summary", summary_key: dedupeKey, mode },
      url: "/provider/calendar",
    },
    ["push"],
    {
      appType: "provider",
      tenantId: row.providers?.tenant_id ?? null,
      skipMustDeliverRetryEnqueue: true,
    },
  );

  return true;
}
