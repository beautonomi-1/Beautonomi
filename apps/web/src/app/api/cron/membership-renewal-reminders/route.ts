/**
 * GET /api/cron/membership-renewal-reminders
 *
 * Sends renewal reminder notifications to customers whose auto-renewing salon
 * memberships are billing in the next 1–3 days. Deduped via `reminder_key` in
 * notifications.data so the same reminder is sent only once per window.
 *
 * Runs daily at 07:00 UTC (after the renewal cron at 06:00).
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { notifyMembershipRenewalReminder } from "@/lib/notifications/notification-service";
import { insertNotification } from "@/lib/notifications/insert-notification";

const REMINDER_DAYS = [3, 1] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date();

    // Fetch memberships with next_billing_at in the next 3 days.
    const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await (supabase.from("user_memberships") as any)
      .select(`
        id,
        user_id,
        provider_id,
        plan_id,
        next_billing_at,
        plan:membership_plans(name, price_monthly, currency)
      `)
      .eq("auto_renew", true)
      .eq("status", "active")
      .not("next_billing_at", "is", null)
      .lte("next_billing_at", threeDaysOut)
      .gte("next_billing_at", now.toISOString());

    if (error) throw error;
    if (!rows?.length) {
      return successResponse({ message: "No renewal reminders to send", sent: 0 });
    }

    let sent = 0;
    const errors: string[] = [];

    for (const row of rows as any[]) {
      const billingAt = new Date(row.next_billing_at);
      const daysUntil = Math.ceil((billingAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const threshold = REMINDER_DAYS.find((d) => daysUntil <= d && daysUntil >= Math.max(d - 1, 1));
      if (!threshold) continue;

      const plan = Array.isArray(row.plan) ? row.plan[0] : row.plan;
      const planName: string = plan?.name ?? "Membership";
      const priceMonthly: number = Number(plan?.price_monthly ?? 0);

      const reminderKey = `mem_renewal_${row.id}_${threshold}d`;

      // Dedup: skip if already sent this specific reminder.
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", row.user_id)
        .contains("data", { reminder_key: reminderKey })
        .limit(1);

      if (existing?.length) continue;

      try {
        await notifyMembershipRenewalReminder(
          row.user_id,
          planName,
          billingAt,
          priceMonthly,
          ["push"],
        );
        // Persist the reminder_key so the dedup query above finds it next run.
        await insertNotification({
          user_id: row.user_id,
          type: "membership_renewal_reminder",
          title: "Membership renewal reminder",
          message: `Your ${planName} membership renews in ${threshold} day${threshold === 1 ? "" : "s"}.`,
          data: { reminder_key: reminderKey, membership_id: row.id, plan_id: row.plan_id },
          action_url: "/account-settings/membership",
        });
        sent++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${row.id}: ${msg}`);
      }
    }

    return successResponse({
      message: "Membership renewal reminders sent",
      checked: rows.length,
      sent,
      errors: errors.length ? errors : undefined,
    });
  } catch (error) {
    return handleApiError(error, "Cron: membership-renewal-reminders failed");
  }
}
