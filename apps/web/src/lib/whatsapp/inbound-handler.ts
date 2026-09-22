import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone, upsertWhatsAppInboundSession } from "@/lib/whatsapp/sessions";
import { sendTwilioWhatsApp } from "@/lib/integrations/twilio";
import { resolveTwilioCredentials } from "@/lib/integrations/twilio";
import { mintGuestPortalTokenForBooking } from "@/lib/portal/guest-booking-link-delivery";
import { canCustomerReportRunningLate } from "@/lib/bookings/lifecycle-running-late";
import { notifyProviderCustomerRunningLate } from "@/lib/notifications/notification-service";
import { resolveUsersByWhatsAppPhone } from "@/lib/whatsapp/resolve-users-by-phone";
import { REMINDER_BUTTON_IDS } from "@/lib/whatsapp/reminder-button-intents";

const OPT_OUT_KEYWORDS = new Set(["stop", "unsubscribe", "optout", "opt out"]);
const REMINDER_BUTTON_SET = new Set(Object.values(REMINDER_BUTTON_IDS));

export type TwilioInboundParams = {
  messageSid: string;
  from: string;
  body: string;
  buttonPayload?: string | null;
  buttonText?: string | null;
};

async function persistInboundMessage(row: {
  phone: string;
  userId: string | null;
  bookingId: string | null;
  twilioSid: string;
  body: string;
  buttonId: string | null;
  payload: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  await supabase.from("whatsapp_customer_messages").upsert(
    {
      direction: "inbound",
      phone: row.phone,
      user_id: row.userId,
      booking_id: row.bookingId,
      twilio_sid: row.twilioSid,
      body: row.body,
      button_id: row.buttonId,
      payload: row.payload,
      status: "received",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "twilio_sid", ignoreDuplicates: true },
  );
}

async function replyWhatsApp(toPhone: string, text: string, tenantId?: string | null) {
  const supabase = getSupabaseAdmin();
  const creds = await resolveTwilioCredentials(supabase, tenantId ?? null);
  if (!creds?.whatsappFrom && !creds?.whatsappSandboxEnabled) return;
  await sendTwilioWhatsApp(creds, toPhone, text);
}

function phonesMatch(a: string, b: string): boolean {
  const da = normalizeWhatsAppPhone(a).replace(/\D/g, "");
  const db = normalizeWhatsAppPhone(b).replace(/\D/g, "");
  return Boolean(da && db && da === db);
}

async function resolveBookingFromIntent(
  supabase: SupabaseClient,
  buttonId: string,
  allowedUserIds: Set<string>,
  inboundPhone: string,
): Promise<{ bookingId: string; action: string; customerId: string | null } | null> {
  if (!REMINDER_BUTTON_SET.has(buttonId as (typeof REMINDER_BUTTON_IDS)[keyof typeof REMINDER_BUTTON_IDS])) {
    const { data: custom } = await supabase
      .from("whatsapp_button_intents")
      .select("booking_id, action, expires_at, user_id")
      .eq("id", buttonId)
      .maybeSingle();
    if (!custom?.booking_id) return null;
    if (new Date(custom.expires_at).getTime() < Date.now()) return null;
    const { data: booking } = await supabase
      .from("bookings")
      .select("customer_id")
      .eq("id", custom.booking_id)
      .maybeSingle();
    const customerId = (booking?.customer_id as string | null) ?? null;
    if (allowedUserIds.size > 0) {
      if (!customerId || !allowedUserIds.has(customerId)) return null;
    } else if (customerId) {
      const { data: cust } = await supabase
        .from("users")
        .select("phone")
        .eq("id", customerId)
        .maybeSingle();
      if (!cust?.phone || !phonesMatch(cust.phone as string, inboundPhone)) return null;
    } else {
      return null;
    }
    return {
      bookingId: custom.booking_id as string,
      action: String(custom.action),
      customerId,
    };
  }

  const { data } = await supabase
    .from("whatsapp_button_intents")
    .select("booking_id, action, expires_at, user_id")
    .eq("id", buttonId)
    .maybeSingle();
  if (!data?.booking_id) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  const { data: booking } = await supabase
    .from("bookings")
    .select("customer_id, tenant_id")
    .eq("id", data.booking_id)
    .maybeSingle();
  const customerId = (booking?.customer_id as string | null) ?? null;

  if (allowedUserIds.size > 0) {
    if (!customerId || !allowedUserIds.has(customerId)) return null;
  } else if (customerId) {
    const { data: cust } = await supabase
      .from("users")
      .select("phone")
      .eq("id", customerId)
      .maybeSingle();
    if (!cust?.phone || !phonesMatch(cust.phone as string, inboundPhone)) return null;
  } else {
    return null;
  }

  return {
    bookingId: data.booking_id as string,
    action: String(data.action),
    customerId,
  };
}

async function latestUpcomingBookingForUser(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("bookings")
    .select("id, scheduled_at, status, customer_id")
    .eq("customer_id", userId)
    .in("status", ["confirmed", "pending", "in_progress"])
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function handleWhatsAppInboundMessage(params: TwilioInboundParams): Promise<void> {
  const supabase = getSupabaseAdmin();
  const phone = normalizeWhatsAppPhone(params.from);
  if (!phone) return;

  const { users } = await resolveUsersByWhatsAppPhone(supabase, params.from);
  const allowedUserIds = new Set(users.map((u) => u.id));
  const singleUserId = users.length === 1 ? users[0].id : null;

  await upsertWhatsAppInboundSession({ phone, userId: singleUserId });

  const buttonId = (params.buttonPayload || "").trim() || null;
  const bodyRaw = (params.body || params.buttonText || "").trim();
  const bodyLower = bodyRaw.toLowerCase();

  const twilioSid =
    params.messageSid?.trim() ||
    `inbound:${phone}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  if (!buttonId && OPT_OUT_KEYWORDS.has(bodyLower)) {
    const { revokeWhatsAppOptInForUserIds } = await import("@/lib/whatsapp/sessions");
    if (allowedUserIds.size > 0) {
      await revokeWhatsAppOptInForUserIds([...allowedUserIds]);
      await persistInboundMessage({
        phone,
        userId: singleUserId,
        bookingId: null,
        twilioSid,
        body: bodyRaw || "STOP",
        buttonId: null,
        payload: { opt_out: true, shared_phone_accounts: users.length },
      });
      await replyWhatsApp(
        phone,
        allowedUserIds.size > 1
          ? "You have been unsubscribed from Beautonomi WhatsApp messages for all accounts on this number."
          : "You have been unsubscribed from Beautonomi WhatsApp messages.",
      );
    } else {
      await persistInboundMessage({
        phone,
        userId: null,
        bookingId: null,
        twilioSid,
        body: bodyRaw || "STOP",
        buttonId: null,
        payload: { opt_out: true, unmatched_phone: true },
      });
      await replyWhatsApp(
        phone,
        "We could not find a Beautonomi account for this number. Open the app or contact support if you need help.",
      );
    }
    return;
  }

  let bookingId: string | null = null;
  let action: string | null = null;
  let resolvedUserId: string | null = singleUserId;
  let buttonIntentRejected = false;

  if (buttonId) {
    const intent = await resolveBookingFromIntent(supabase, buttonId, allowedUserIds, phone);
    if (intent) {
      bookingId = intent.bookingId;
      action = intent.action;
      resolvedUserId = intent.customerId ?? resolvedUserId;
    } else {
      buttonIntentRejected = true;
    }
  }

  if (!bookingId && singleUserId) {
    const upcoming = await latestUpcomingBookingForUser(supabase, singleUserId);
    bookingId = upcoming?.id ?? null;
  }

  await persistInboundMessage({
    phone,
    userId: resolvedUserId,
    bookingId,
    twilioSid,
    body: bodyRaw,
    buttonId,
    payload: {
      buttonText: params.buttonText ?? null,
      shared_phone_accounts: users.length,
    },
  });

  if (users.length > 1 && !buttonId) {
    await replyWhatsApp(
      phone,
      "More than one Beautonomi account uses this number. Tap Confirm, Reschedule, or Cancel on your booking reminder message (not free text).",
    );
    return;
  }

  if (buttonIntentRejected && buttonId) {
    await replyWhatsApp(
      phone,
      users.length > 1
        ? "We could not match that button to your account. Please use the button on your latest booking reminder message."
        : "That button is not linked to an appointment for this number. Use the latest reminder message we sent you.",
    );
    return;
  }

  if (action === "confirm" && bookingId) {
    await supabase
      .from("bookings")
      .update({ customer_rsvp_at: new Date().toISOString() })
      .eq("id", bookingId);
    await supabase.from("booking_events").insert({
      booking_id: bookingId,
      event_type: "customer_rsvp",
      metadata: { source: "whatsapp" },
    });
    await replyWhatsApp(phone, "Thanks — you're confirmed. See you soon!");
    return;
  }

  if ((action === "cancel" || bodyLower === "cancel") && bookingId) {
    if (bodyLower === "cancel" && !action && users.length !== 1) {
      await replyWhatsApp(phone, "To cancel, tap Cancel on your booking reminder message so we know which appointment you mean.");
      return;
    }
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, scheduled_at")
      .eq("id", bookingId)
      .maybeSingle();
    if (booking?.scheduled_at) {
      const { portalUrl } = await mintGuestPortalTokenForBooking(
        supabase,
        bookingId,
        String(booking.scheduled_at),
      );
      await replyWhatsApp(
        phone,
        `To cancel with any applicable fees shown upfront, open: ${portalUrl}`,
      );
    }
    return;
  }

  if (action === "reschedule" && bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("scheduled_at")
      .eq("id", bookingId)
      .maybeSingle();
    if (booking?.scheduled_at) {
      const { portalUrl } = await mintGuestPortalTokenForBooking(
        supabase,
        bookingId,
        String(booking.scheduled_at),
      );
      await replyWhatsApp(
        phone,
        `Reschedule here: ${portalUrl.replace("/portal/booking?", "/portal/booking/reschedule?")}`,
      );
    }
    return;
  }

  if (action === "running_late" && bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select(
        "scheduled_at, status, location_type, current_stage, customer_running_late_at, booking_services(scheduled_end_at, duration_minutes)",
      )
      .eq("id", bookingId)
      .maybeSingle();
    if (booking?.scheduled_at) {
      const gate = canCustomerReportRunningLate(
        booking as Parameters<typeof canCustomerReportRunningLate>[0],
      );
      if (!gate.ok) {
        const tooEarly = "reason" in gate && gate.reason === "too_early";
        const msg = tooEarly
          ? "You can tap Running late from 30 minutes before your appointment. Open your booking link for details."
          : "We cannot record running late for this booking right now.";
        await replyWhatsApp(phone, msg);
        return;
      }
      const delayMinutes = 15;
      await supabase
        .from("bookings")
        .update({
          customer_running_late_minutes: delayMinutes,
          customer_running_late_at: new Date().toISOString(),
        })
        .eq("id", bookingId);
      const { data: tenantRow } = await supabase
        .from("bookings")
        .select("tenant_id")
        .eq("id", bookingId)
        .maybeSingle();
      const { providerBookingChannels } = await import(
        "@/lib/notifications/customer-booking-channels"
      );
      await notifyProviderCustomerRunningLate(
        bookingId,
        delayMinutes,
        await providerBookingChannels((tenantRow?.tenant_id as string | null) ?? null),
      );
      await replyWhatsApp(phone, `Thanks — we let the salon know you're about ${delayMinutes} minutes late.`);
    }
    return;
  }

  if (bodyLower === "hi" || bodyLower === "help") {
    if (bookingId) {
      await replyWhatsApp(
        phone,
        "Reply with your booking link from the last message, or open the Beautonomi app for full details.",
      );
    } else {
      await replyWhatsApp(phone, "Hi! Open the Beautonomi app or reply with your booking number for help.");
    }
  }
}
