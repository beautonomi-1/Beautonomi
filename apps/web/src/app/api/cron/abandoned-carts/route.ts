import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F27 — Abandoned cart reminder cron.
 *
 * Every 6 hours, find cart_items that:
 *  - have no matching paid product_order since they were last updated
 *  - have not already had a reminder sent in the last 24 hours
 * and fire a single OneSignal + notifications-table reminder. The reminder
 * link deep-links to /cart so the customer can resume checkout.
 *
 * Idempotency: `abandoned_cart_reminders` table (created on first run
 * via IF NOT EXISTS DDL in migration TBD) tracks (user_id, last_sent_at).
 * If the table doesn't exist we fall back to `notifications` table scan.
 */
const REMINDER_INTERVAL_HOURS = 6;
const REMINDER_COOLDOWN_HOURS = 24;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ ok: false, error: auth.error ?? "unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const cutoff = new Date(Date.now() - REMINDER_INTERVAL_HOURS * 60 * 60 * 1000).toISOString();
  const cooldownFrom = new Date(Date.now() - REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

  const { data: abandoned, error } = await admin
    .from("cart_items")
    .select("user_id, provider_id, product_id, quantity, updated_at")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[abandoned-carts] query failed", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const byUser = new Map<string, { providerId: string; items: number; firstProductId: string }>();
  for (const row of abandoned ?? []) {
    const existing = byUser.get(row.user_id);
    if (existing) {
      existing.items += Number(row.quantity ?? 1);
    } else {
      byUser.set(row.user_id, {
        providerId: row.provider_id,
        items: Number(row.quantity ?? 1),
        firstProductId: row.product_id,
      });
    }
  }

  if (byUser.size === 0) {
    return NextResponse.json({ ok: true, sent: 0, candidates: 0 });
  }

  const userIds = Array.from(byUser.keys());
  const { data: recentReminders } = await admin
    .from("notifications")
    .select("user_id")
    .in("user_id", userIds)
    .eq("type", "abandoned_cart_reminder")
    .gte("created_at", cooldownFrom);

  const recentSet = new Set((recentReminders ?? []).map((r) => r.user_id));

  const { sendToUser } = await import("@/lib/notifications/onesignal").catch(
    () => ({ sendToUser: null as unknown as (...args: unknown[]) => Promise<unknown> }),
  );
  const { insertNotification } = await import("@/lib/notifications/insert-notification").catch(
    () => ({ insertNotification: null as unknown as (...args: unknown[]) => Promise<unknown> }),
  );

  let sent = 0;
  for (const [userId, info] of byUser.entries()) {
    if (recentSet.has(userId)) continue;

    const body = info.items > 1
      ? `You have ${info.items} items waiting in your cart.`
      : "You have an item waiting in your cart.";

    try {
      if (insertNotification) {
        await insertNotification({
          user_id: userId,
          type: "abandoned_cart_reminder",
          title: "Still thinking it over?",
          message: body,
          data: {
            provider_id: info.providerId,
            product_id: info.firstProductId,
            deep_link: "/cart",
          },
        });
      }
      if (sendToUser) {
        await sendToUser(userId, {
          title: "Still thinking it over?",
          message: body,
          url: "/cart",
          data: { type: "abandoned_cart_reminder" },
        });
      }
      sent += 1;
    } catch (err) {
      console.warn("[abandoned-carts] reminder failed", userId, err);
    }
  }

  return NextResponse.json({ ok: true, candidates: byUser.size, sent });
}
