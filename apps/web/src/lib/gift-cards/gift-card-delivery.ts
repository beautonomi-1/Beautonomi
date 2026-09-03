/**
 * Gift card delivery: scheduled send, SMS channel, resend and expiry reminders (Part J2).
 *
 * How scheduled delivery works without touching the Paystack charge.success handler:
 *   • The purchase route stores a future `deliver_at` and keeps the recipient email
 *     OUT of `gift_card_orders.recipient_email` (it lives in
 *     `metadata.scheduled_recipient_email`). The webhook only emails recipients when
 *     the column is set, so nothing goes out at payment time.
 *   • The `gift-card-expiry-reminders` cron calls `deliverDueScheduledGiftCards`, which
 *     claims each due order (`delivered_at` null → now), restores the recipient email on
 *     the order + cards (so the card shows up in the recipient's wallet), and sends
 *     email and/or SMS.
 *   • Immediate orders with an SMS channel are also picked up by the cron for the SMS
 *     leg only (the webhook already emailed).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type GiftCardDeliveryChannel = "email" | "sms" | "email_sms";

/** Minimum lead time for a delivery to count as scheduled (avoids racing the webhook). */
export const SCHEDULED_DELIVERY_MIN_LEAD_MS = 60 * 1000;
/** Furthest-out delivery we accept (1 year). */
export const SCHEDULED_DELIVERY_MAX_LEAD_MS = 366 * 24 * 60 * 60 * 1000;

export const GIFT_CARD_EXPIRY_REMINDER_DAYS = [30, 7] as const;
export type GiftCardReminderWindow = (typeof GIFT_CARD_EXPIRY_REMINDER_DAYS)[number];

export function parseGiftCardDeliveryChannel(raw: unknown): GiftCardDeliveryChannel {
  if (raw === "sms" || raw === "email_sms") return raw;
  return "email";
}

export function channelIncludesEmail(channel: GiftCardDeliveryChannel): boolean {
  return channel === "email" || channel === "email_sms";
}

export function channelIncludesSms(channel: GiftCardDeliveryChannel): boolean {
  return channel === "sms" || channel === "email_sms";
}

/**
 * True when `deliverAt` is far enough in the future that delivery must be deferred.
 * Null/invalid/past timestamps mean "deliver now".
 */
export function isScheduledGiftCardDelivery(
  deliverAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!deliverAt) return false;
  const ts = deliverAt instanceof Date ? deliverAt.getTime() : new Date(deliverAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return ts - now.getTime() > SCHEDULED_DELIVERY_MIN_LEAD_MS;
}

/** Validate a requested deliver_at: null when immediate, ISO string when scheduled, error otherwise. */
export function normalizeRequestedDeliverAt(
  raw: string | null | undefined,
  now: Date = new Date(),
): { ok: true; deliverAt: string | null } | { ok: false; code: "DELIVER_AT_INVALID" | "DELIVER_AT_TOO_FAR" } {
  if (!raw) return { ok: true, deliverAt: null };
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return { ok: false, code: "DELIVER_AT_INVALID" };
  if (ts - now.getTime() > SCHEDULED_DELIVERY_MAX_LEAD_MS) return { ok: false, code: "DELIVER_AT_TOO_FAR" };
  if (ts - now.getTime() <= SCHEDULED_DELIVERY_MIN_LEAD_MS) return { ok: true, deliverAt: null };
  return { ok: true, deliverAt: new Date(ts).toISOString() };
}

/** Very light E.164-ish phone normalisation (digits with optional leading +). */
export function normalizeRecipientPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/[\s\-().]/g, "");
  if (!/^\+?\d{8,15}$/.test(trimmed)) return null;
  return trimmed;
}

export function buildGiftCardSmsBody(params: {
  senderName: string;
  codes: string[];
  perCardAmount: number;
  currency: string;
  redeemUrl?: string | null;
}): string {
  const money = `${params.currency} ${Number(params.perCardAmount).toFixed(2)}`;
  const codeLine =
    params.codes.length === 1
      ? `Code: ${params.codes[0]}`
      : `Codes: ${params.codes.join(", ")}`;
  const parts = [
    `${params.senderName} sent you a Beautonomi gift card worth ${money}${params.codes.length > 1 ? " each" : ""}.`,
    codeLine,
    params.redeemUrl ? `Redeem: ${params.redeemUrl}` : "Redeem in the Beautonomi app under Wallet > Gift Card.",
  ];
  return parts.join(" ");
}

// ───────────────────────────── order delivery ─────────────────────────────────

type GiftCardOrderRow = {
  id: string;
  purchaser_user_id?: string | null;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  delivery_channel?: string | null;
  deliver_at?: string | null;
  delivered_at?: string | null;
  gift_card_id?: string | null;
  amount?: number | string | null;
  quantity?: number | null;
  currency?: string | null;
  tenant_id?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

type GiftCardRow = {
  id: string;
  code: string;
  metadata?: Record<string, unknown> | null;
};

const ORDER_COLUMNS =
  "id, purchaser_user_id, recipient_email, recipient_phone, delivery_channel, deliver_at, delivered_at, gift_card_id, amount, quantity, currency, tenant_id, status, metadata";

async function loadOrderCards(supabase: SupabaseClient, order: GiftCardOrderRow): Promise<GiftCardRow[]> {
  const byId = new Map<string, GiftCardRow>();
  const { data: siblings } = await supabase
    .from("gift_cards")
    .select("id, code, metadata")
    .eq("metadata->>order_id", order.id);
  for (const c of (siblings ?? []) as GiftCardRow[]) if (c?.id) byId.set(c.id, c);
  if (order.gift_card_id && !byId.has(order.gift_card_id)) {
    const { data: first } = await supabase
      .from("gift_cards")
      .select("id, code, metadata")
      .eq("id", order.gift_card_id)
      .maybeSingle();
    if ((first as GiftCardRow | null)?.id) byId.set(order.gift_card_id, first as GiftCardRow);
  }
  return Array.from(byId.values());
}

export type DeliverGiftCardOrderResult = {
  orderId: string;
  emailed: boolean;
  smsSent: boolean;
  purchaserNotified: boolean;
  skipped?: "already_delivered" | "not_paid" | "no_cards" | "no_recipient";
};

/**
 * Send a paid order to its recipient (email and/or SMS) and stamp `delivered_at`.
 * Idempotent: the `delivered_at` claim makes a second call a no-op unless `force`.
 */
export async function deliverGiftCardOrderNow(params: {
  supabase: SupabaseClient;
  orderId: string;
  /** Resend path: bypass the delivered_at claim and optionally override contacts. */
  force?: boolean;
  overrideRecipientEmail?: string | null;
  overrideRecipientPhone?: string | null;
  now?: Date;
}): Promise<DeliverGiftCardOrderResult> {
  const { supabase, orderId, force = false } = params;
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();

  const { data: orderData } = await supabase
    .from("gift_card_orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .maybeSingle();
  const order = (orderData ?? null) as GiftCardOrderRow | null;
  if (!order?.id) return { orderId, emailed: false, smsSent: false, purchaserNotified: false, skipped: "no_cards" };
  if (order.status !== "paid") {
    return { orderId, emailed: false, smsSent: false, purchaserNotified: false, skipped: "not_paid" };
  }

  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  const wasScheduled = Boolean(order.deliver_at);
  const channel = parseGiftCardDeliveryChannel(order.delivery_channel);
  const recipientEmail =
    (params.overrideRecipientEmail ??
      order.recipient_email ??
      (typeof meta.scheduled_recipient_email === "string" ? meta.scheduled_recipient_email : null) ??
      "")
      .toString()
      .trim()
      .toLowerCase() || null;
  const recipientPhone = normalizeRecipientPhone(params.overrideRecipientPhone ?? order.recipient_phone ?? null);

  if (!recipientEmail && !recipientPhone) {
    return { orderId, emailed: false, smsSent: false, purchaserNotified: false, skipped: "no_recipient" };
  }

  // Claim (idempotency) unless forcing a resend.
  if (!force) {
    const { data: claimed } = await supabase
      .from("gift_card_orders")
      .update({ delivered_at: nowIso, updated_at: nowIso })
      .eq("id", orderId)
      .is("delivered_at", null)
      .select("id");
    if (!Array.isArray(claimed) || claimed.length === 0) {
      return { orderId, emailed: false, smsSent: false, purchaserNotified: false, skipped: "already_delivered" };
    }
  }

  const cards = await loadOrderCards(supabase, order);
  if (cards.length === 0) {
    return { orderId, emailed: false, smsSent: false, purchaserNotified: false, skipped: "no_cards" };
  }
  const codes = cards.map((c) => c.code).filter(Boolean);
  const perCardAmount = Number(order.amount ?? 0);
  const currency = order.currency || "ZAR";

  // Scheduled (or contact override): make the recipient email visible on the order + cards so the
  // wallet list (GET /api/me/gift-cards matches metadata.recipient_email) shows the gift from now on.
  if (recipientEmail && (wasScheduled || params.overrideRecipientEmail) && recipientEmail !== order.recipient_email) {
    await supabase
      .from("gift_card_orders")
      .update({ recipient_email: recipientEmail, updated_at: nowIso })
      .eq("id", orderId);
    for (const card of cards) {
      await supabase
        .from("gift_cards")
        .update({
          metadata: { ...((card.metadata ?? {}) as Record<string, unknown>), recipient_email: recipientEmail },
          updated_at: nowIso,
        })
        .eq("id", card.id);
    }
  }

  let emailed = false;
  let smsSent = false;
  let purchaserNotified = false;

  const recipientName = typeof meta.recipient_name === "string" ? meta.recipient_name : null;
  const giftMessage = typeof meta.message === "string" ? meta.message : null;

  // Email: for immediate orders the webhook already sent it unless this is a forced resend.
  const shouldEmail = Boolean(recipientEmail) && channelIncludesEmail(channel) && (wasScheduled || force);
  if (shouldEmail && recipientEmail) {
    try {
      const { deliverGiftCardToRecipient } = await import("@/lib/notifications/gift-card-recipient-delivery");
      await deliverGiftCardToRecipient({
        supabase,
        orderId,
        recipientEmail,
        recipientName,
        message: giftMessage,
        purchaserUserId: order.purchaser_user_id ?? null,
        codes,
        perCardAmount,
        currency,
        tenantId: order.tenant_id ?? null,
      });
      emailed = true;
    } catch (err) {
      console.error("[gift-card-delivery] email delivery failed:", err);
    }
  }

  if (recipientPhone && channelIncludesSms(channel)) {
    try {
      let senderName = "Someone";
      if (order.purchaser_user_id) {
        const { data: purchaser } = await supabase
          .from("users")
          .select("full_name")
          .eq("id", order.purchaser_user_id)
          .maybeSingle();
        const fullName = (purchaser as { full_name?: string | null } | null)?.full_name;
        if (typeof fullName === "string" && fullName.trim()) senderName = fullName.trim();
      }
      const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
      const redeemUrl = appBase
        ? codes.length === 1
          ? `${appBase}/account-settings/wallet?giftCode=${encodeURIComponent(codes[0])}`
          : `${appBase}/account-settings/wallet`
        : null;
      const { enqueueNotification } = await import("@/lib/notifications/enqueue");
      const res = await enqueueNotification(
        {
          channel: "sms",
          templateKey: "gift_card_received",
          recipientUserId: null,
          payload: {
            to: recipientPhone,
            body: buildGiftCardSmsBody({ senderName, codes, perCardAmount, currency, redeemUrl }),
            data: { type: "gift_card_received", gift_card_order_id: orderId },
          },
          dedupeKey: force
            ? `gift_card:received:sms:${orderId}:${now.getTime()}`
            : `gift_card:received:sms:${orderId}`,
          tenantId: order.tenant_id ?? null,
        },
        supabase,
      );
      smsSent = Boolean(res.inserted || res.id);
    } catch (err) {
      console.error("[gift-card-delivery] sms delivery failed:", err);
    }
  }

  // Tell the purchaser their gift went out (push only; template gift_card_delivered).
  if (order.purchaser_user_id && (emailed || smsSent)) {
    try {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      const channelLabel = emailed && smsSent ? "email and SMS" : smsSent ? "SMS" : "email";
      await sendTemplateNotification(
        "gift_card_delivered",
        [order.purchaser_user_id],
        {
          recipient_name: recipientName || recipientEmail || recipientPhone || "your recipient",
          amount: perCardAmount.toFixed(2),
          currency,
          channel: channelLabel,
          app_url: (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, ""),
        },
        ["push"],
        { appType: "customer", tenantId: order.tenant_id ?? null },
      );
      purchaserNotified = true;
    } catch (err) {
      console.error("[gift-card-delivery] purchaser notification failed:", err);
    }
  }

  if (force) {
    await supabase
      .from("gift_card_orders")
      .update({ delivered_at: nowIso, updated_at: nowIso })
      .eq("id", orderId);
  }

  return { orderId, emailed, smsSent, purchaserNotified };
}

/** Cron step (a): deliver due scheduled orders + SMS legs of immediate orders. */
export async function deliverDueScheduledGiftCards(
  supabase: SupabaseClient,
  now: Date = new Date(),
  limit = 100,
): Promise<{ checked: number; delivered: number; skipped: number; errors: string[] }> {
  const nowIso = now.toISOString();
  const { data, error } = await supabase
    .from("gift_card_orders")
    .select("id")
    .eq("status", "paid")
    .is("delivered_at", null)
    .or(`and(deliver_at.not.is.null,deliver_at.lte.${nowIso}),and(deliver_at.is.null,delivery_channel.in.(sms,email_sms))`)
    .order("deliver_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const out = { checked: 0, delivered: 0, skipped: 0, errors: [] as string[] };
  for (const row of (data ?? []) as Array<{ id: string }>) {
    out.checked += 1;
    try {
      const res = await deliverGiftCardOrderNow({ supabase, orderId: row.id, now });
      if (res.skipped) out.skipped += 1;
      else out.delivered += 1;
    } catch (err) {
      out.errors.push(`${row.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

// ───────────────────────────── expiry reminders ───────────────────────────────

type ReminderCardRow = {
  id: string;
  code: string;
  balance: number | string;
  currency?: string | null;
  expires_at: string;
  tenant_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

function reminderColumn(days: GiftCardReminderWindow): "reminder_30_sent_at" | "reminder_7_sent_at" {
  return days === 30 ? "reminder_30_sent_at" : "reminder_7_sent_at";
}

async function resolveReminderRecipient(
  supabase: SupabaseClient,
  card: ReminderCardRow,
): Promise<{ userId: string | null; email: string | null }> {
  const meta = (card.metadata ?? {}) as Record<string, unknown>;
  const recipientUserId = typeof meta.recipient_user_id === "string" ? meta.recipient_user_id : null;
  const recipientEmail =
    typeof meta.recipient_email === "string" && meta.recipient_email.trim()
      ? meta.recipient_email.trim().toLowerCase()
      : null;
  if (recipientUserId) return { userId: recipientUserId, email: recipientEmail };
  if (recipientEmail) {
    const { data: userRow } = await supabase.from("users").select("id").eq("email", recipientEmail).maybeSingle();
    const id = (userRow as { id?: string } | null)?.id ?? null;
    if (id) return { userId: id, email: recipientEmail };
    return { userId: null, email: recipientEmail };
  }
  const purchaserUserId = typeof meta.purchaser_user_id === "string" ? meta.purchaser_user_id : null;
  return { userId: purchaserUserId, email: null };
}

/** Cron step (b): 30-day and 7-day expiry reminders, idempotent via reminder_*_sent_at. */
export async function sendGiftCardExpiryReminders(
  supabase: SupabaseClient,
  now: Date = new Date(),
  limitPerWindow = 200,
): Promise<{ windows: Record<string, { checked: number; sent: number; skipped: number }>; errors: string[] }> {
  const windows: Record<string, { checked: number; sent: number; skipped: number }> = {};
  const errors: string[] = [];
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  for (const days of GIFT_CARD_EXPIRY_REMINDER_DAYS) {
    const column = reminderColumn(days);
    const stats = { checked: 0, sent: 0, skipped: 0 };
    windows[`${days}d`] = stats;
    const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("gift_cards")
      .select("id, code, balance, currency, expires_at, tenant_id, metadata")
      .eq("is_active", true)
      .gt("balance", 0)
      .not("expires_at", "is", null)
      .gt("expires_at", now.toISOString())
      .lte("expires_at", horizon)
      .is(column, null)
      .order("expires_at", { ascending: true })
      .limit(limitPerWindow);
    if (error) {
      errors.push(`${days}d query: ${error.message}`);
      continue;
    }

    for (const card of (data ?? []) as ReminderCardRow[]) {
      stats.checked += 1;
      try {
        // Claim first so overlapping runs never double-send.
        const { data: claimed } = await supabase
          .from("gift_cards")
          .update({ [column]: now.toISOString() })
          .eq("id", card.id)
          .is(column, null)
          .select("id");
        if (!Array.isArray(claimed) || claimed.length === 0) {
          stats.skipped += 1;
          continue;
        }

        const expiresAt = new Date(card.expires_at);
        const daysUntil = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
        // The 30-day pass must not fire for cards already inside the 7-day window
        // (they get the more urgent reminder from the 7-day pass instead).
        if (days === 30 && daysUntil <= 7) {
          stats.skipped += 1;
          continue;
        }

        const { userId, email } = await resolveReminderRecipient(supabase, card);
        const balance = Number(card.balance ?? 0);
        const currency = card.currency || "ZAR";
        const vars = {
          code_last4: String(card.code ?? "").slice(-4),
          balance: balance.toFixed(2),
          currency,
          expires_at: expiresAt.toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" }),
          days_until: String(daysUntil),
          app_url: appUrl,
        };
        const templateKey = `gift_card_expiring_${days}d`;

        if (userId) {
          const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
          await sendTemplateNotification(templateKey, [userId], vars, ["push", "email"], {
            appType: "customer",
            tenantId: card.tenant_id ?? null,
          });
          stats.sent += 1;
        } else if (email) {
          const { enqueueNotification } = await import("@/lib/notifications/enqueue");
          await enqueueNotification(
            {
              channel: "email",
              templateKey,
              recipientUserId: null,
              payload: {
                to: email,
                subject: `Your Beautonomi gift card expires in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
                html: `<p>Your gift card ending in <strong>${vars.code_last4}</strong> still has <strong>${currency} ${vars.balance}</strong> left and expires on <strong>${vars.expires_at}</strong>.</p>${
                  appUrl ? `<p><a href="${appUrl}/account-settings/wallet">Use it now</a></p>` : ""
                }`,
                body: `Your Beautonomi gift card (…${vars.code_last4}) with ${currency} ${vars.balance} expires on ${vars.expires_at}.`,
              },
              dedupeKey: `${templateKey}:${card.id}`,
              tenantId: card.tenant_id ?? null,
            },
            supabase,
          );
          stats.sent += 1;
        } else {
          stats.skipped += 1;
        }
      } catch (err) {
        errors.push(`${card.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { windows, errors };
}
