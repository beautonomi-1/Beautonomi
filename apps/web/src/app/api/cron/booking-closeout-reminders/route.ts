/**
 * GET /api/cron/booking-closeout-reminders
 *
 * Hourly. For each active provider whose local time is 07:00–09:00, sends one
 * reminder per provider-local day when confirmed appointments from previous
 * days are still open (needs close-out). Nudge-only — never auto-completes,
 * auto-no-shows, or applies fees.
 *
 * Escalation (plan §P):
 *   - open ≤ 3 days: owner + assigned staff for those bookings
 *   - open > 3 days: owner-only daily digest with count
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dispatchTemplateNotification } from "@/lib/notifications/dispatch-template-notification";
import { insertNotification } from "@/lib/notifications/insert-notification";
import { getProviderStaffUserIds } from "@/lib/notifications/notify-provider-team";
import {
  CLOSE_OUT_BOOKINGS_PATH,
  CLOSEOUT_ESCALATION_OWNER_ONLY_AFTER_DAYS,
  closeOutReminderTitle,
  enrichCloseOutRows,
  loadProviderLifecycleRow,
  summarizeCloseOutRows,
} from "@/lib/bookings/lifecycle-close-out";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_BOOKING_CLOSEOUT_PROMPTED } from "@/lib/analytics/amplitude/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOB_NAME = "booking-closeout-reminders";
export const CLOSEOUT_REMINDER_TEMPLATE_KEY = "provider_closeout_reminder";

export function isMorningWindowInTimezone(timezone: string, now = new Date()): boolean {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "numeric", hour12: false }).format(now),
    );
  } catch {
    hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Johannesburg",
        hour: "numeric",
        hour12: false,
      }).format(now),
    );
  }
  return hour >= 7 && hour < 9;
}

function localDayKey(timezone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(now);
  }
}

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ ok: false, error: auth.error ?? "unauthorized" }, { status: 401 });
  }

  return runLockedCronRoute(JOB_NAME, async () => {
    const admin = getSupabaseAdmin();
    const now = new Date();
    const lookbackIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: providers, error } = await admin
      .from("providers")
      .select("id, user_id, timezone, tenant_id")
      .eq("status", "active")
      .limit(1000);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let sent = 0;
    let skipped = 0;

    for (const provider of providers ?? []) {
      const providerId = (provider as { id: string }).id;
      const ownerUserId = (provider as { user_id?: string | null }).user_id;
      const timezone =
        (provider as { timezone?: string | null }).timezone?.trim() || "Africa/Johannesburg";

      if (!ownerUserId || !isMorningWindowInTimezone(timezone, now)) {
        skipped += 1;
        continue;
      }

      const dayKey = localDayKey(timezone, now);
      const reminderKey = `closeout_reminder_${providerId}_${dayKey}`;

      // One reminder per provider-local day (dedupe on our own bell row).
      const { data: existing } = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", ownerUserId)
        .contains("data", { reminder_key: reminderKey })
        .limit(1);
      if (existing?.length) {
        skipped += 1;
        continue;
      }

      const { data: bookings } = await admin
        .from("bookings")
        .select(
          `
          id,
          scheduled_at,
          status,
          location_type,
          current_stage,
          staff_id,
          booking_services(scheduled_end_at, duration_minutes, staff_id, offerings(duration_minutes))
        `,
        )
        .eq("provider_id", providerId)
        .in("status", ["confirmed", "checked_in", "waiting", "in_progress"])
        .gte("scheduled_at", lookbackIso)
        .limit(300);

      const settings = await loadProviderLifecycleRow(admin, providerId);
      const closeOutRows = enrichCloseOutRows((bookings ?? []) as never[], settings, now);
      const summary = summarizeCloseOutRows(closeOutRows, timezone);

      if (summary.older <= 0) {
        skipped += 1;
        continue;
      }

      // Escalation tier: how long has the oldest leftover been open?
      const oldestMs = Math.min(
        ...closeOutRows.map((r) => new Date(String(r.scheduled_at)).getTime()),
      );
      const oldestOpenDays = Math.floor((now.getTime() - oldestMs) / (24 * 60 * 60 * 1000));
      const ownerOnly = oldestOpenDays > CLOSEOUT_ESCALATION_OWNER_ONLY_AFTER_DAYS;

      const recipients = new Set<string>([ownerUserId]);
      if (!ownerOnly) {
        const staffIds = [
          ...new Set(
            closeOutRows
              .flatMap((r) => [
                r.staff_id as string | null | undefined,
                ...((r.booking_services ?? []).map((s) => s.staff_id) as Array<string | null | undefined>),
              ])
              .filter(Boolean) as string[],
          ),
        ];
        for (const uid of await getProviderStaffUserIds(providerId, staffIds)) recipients.add(uid);
      }

      const recipientIds = [...recipients];
      const title = closeOutReminderTitle(ownerOnly);
      const message = ownerOnly
        ? `${summary.older} appointments have been open for more than ${CLOSEOUT_ESCALATION_OWNER_ONLY_AFTER_DAYS} days. Close them out to keep reports accurate.`
        : `You have ${summary.older} appointments from previous days still open. Mark them completed, no-show, or cancelled.`;

      const result = await dispatchTemplateNotification(
        CLOSEOUT_REMINDER_TEMPLATE_KEY,
        recipientIds,
        {
          tenant_id: (provider as { tenant_id?: string | null }).tenant_id ?? "",
          count: String(summary.older),
          provider_id: providerId,
        },
        ["push", "email"],
        { appType: "provider", skipInApp: true },
      );

      if ((result as { notification_id?: string } | null)?.notification_id === "suppressed-quiet-hours") {
        skipped += 1;
        continue;
      }

      for (const uid of recipientIds) {
        await insertNotification({
          user_id: uid,
          type: "booking_status_update",
          title,
          message,
          data: {
            reminder_key: reminderKey,
            provider_id: providerId,
            open_count: summary.older,
            oldest_open_days: oldestOpenDays,
            template_key: CLOSEOUT_REMINDER_TEMPLATE_KEY,
          },
          action_url: CLOSE_OUT_BOOKINGS_PATH,
        });
      }

      try {
        await trackServer(
          EVENT_BOOKING_CLOSEOUT_PROMPTED,
          {
            provider_id: providerId,
            open_count: summary.older,
            oldest_open_days: oldestOpenDays,
            tier: ownerOnly ? "owner_digest" : "team",
            surface: "morning_reminder",
          },
          ownerUserId,
          { insertId: `booking_closeout_prompted:${reminderKey}` },
        );
      } catch {
        // analytics is non-blocking
      }

      sent += 1;
    }

    return NextResponse.json({ ok: true, sent, skipped, scanned: providers?.length ?? 0 });
  });
}
