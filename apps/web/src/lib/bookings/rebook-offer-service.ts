import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import {
  buildAbsoluteRebookLink,
  buildRebookOfferClientMessage,
  buildRebookOfferProviderHint,
  ensureSingleLinkInMessage,
  firstNameFromDisplayName,
  resolveBookWithLabel,
  type RebookServiceLine,
} from "@beautonomi/utils";
import { maskPhoneForDisplay } from "@beautonomi/utils";
import { formatInTz, addDaysToYmd } from "@/lib/dates/provider-tz";
import { computePublicSlugAvailabilitySlots } from "@/lib/availability/public-slug-availability-engine";
import { checkActiveHoldOverlap } from "@/lib/bookings/conflict-check";
import { assertPublicSlotBookable } from "@/lib/provider-booking/assert-public-slot-bookable";
import { holdGridDurationMinutesFromSnapshot } from "@/lib/booking-slot-math/blocked-window-minutes";
import { getAppBaseUrl } from "@/lib/env/app-url";
import { channelAllowedForCustomerUser } from "@/lib/notifications/customer-notification-channels";
import {
  rebookOfferCanEditClientPhone,
  rebookOfferCanSeeClientContact,
  rebookOfferWhatsAppHandoffAllowed,
} from "@/lib/bookings/rebook-offer-permissions";

const REBOOK_HOLD_MS = 24 * 60 * 60 * 1000;

export type RebookOfferPreview = {
  customerUserId: string;
  clientFirstName: string;
  primaryServiceTitle: string;
  rebookWeeks: number | null;
  rebookEnabled: boolean;
  multiService: boolean;
  providerHint: string;
  messageBody: string;
  link: string;
  channel: "whatsapp_handoff" | "sms" | "email" | "push" | "none";
  channelReason: string | null;
  maskedDestination: string | null;
  canWhatsAppHandoff: boolean;
  canEditMessage: boolean;
  canEditClientPhone: boolean;
  /** False only when the client account has no phone. The number itself stays off this payload. */
  hasClientPhone: boolean;
  suggestedSlot: { startAt: string; endAt: string; dateYmd: string; staffId: string | null } | null;
  existingOffer: {
    id: string;
    status: string;
    openedAt: string | null;
    sentAt: string | null;
    bookedAt: string | null;
  } | null;
};

type BookingContext = {
  booking: Record<string, unknown>;
  provider: { id: string; slug: string; business_name: string; business_type: string; timezone: string };
  customer: { id: string; email: string | null; phone: string | null; full_name: string | null };
  services: Array<{
    offering_id: string;
    staff_id: string | null;
    staff_name: string | null;
    title: string;
    duration_minutes: number;
    buffer_minutes: number;
    reminder_to_rebook_enabled: boolean;
    reminder_to_rebook_weeks: number;
  }>;
  snapshot: Array<Record<string, unknown>>;
  rebookLines: RebookServiceLine[];
  locationType: "at_home" | "at_salon";
  locationId: string | null;
  totalBlockedMinutes: number;
  primary: {
    offering_id: string;
    staff_id: string | null;
    staff_name: string | null;
    title: string;
    duration_minutes: number;
    buffer_minutes: number;
    reminder_to_rebook_enabled: boolean;
    reminder_to_rebook_weeks: number;
  };
  isGroup: boolean;
};

async function loadBookingContext(
  supabase: SupabaseClient,
  bookingId: string,
  providerId: string,
): Promise<BookingContext | null> {
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, provider_id, customer_id, tenant_id, completed_at, location_id, location_type, is_group_booking, booking_services(id, offering_id, staff_id, offering:offerings(id, title, duration_minutes, buffer_minutes, reminder_to_rebook_enabled, reminder_to_rebook_weeks), staff:provider_staff(id, name))",
    )
    .eq("id", bookingId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (!booking) return null;

  const { data: provider } = await supabase
    .from("providers")
    .select("id, slug, business_name, business_type, timezone")
    .eq("id", providerId)
    .maybeSingle();
  if (!provider?.slug) return null;

  const { data: customer } = await supabase
    .from("users")
    .select("id, email, phone, full_name")
    .eq("id", (booking as { customer_id: string }).customer_id)
    .maybeSingle();
  if (!customer) return null;

  const rows =
    (booking as { booking_services?: unknown[] }).booking_services ?? [];
  const services = rows.map((row) => {
    const r = row as {
      offering_id: string;
      staff_id: string | null;
      offering?: { title?: string; duration_minutes?: number; buffer_minutes?: number; reminder_to_rebook_enabled?: boolean; reminder_to_rebook_weeks?: number } | Array<unknown>;
      staff?: { name?: string } | Array<unknown>;
    };
    const off = Array.isArray(r.offering) ? r.offering[0] : r.offering;
    const st = Array.isArray(r.staff) ? r.staff[0] : r.staff;
    return {
      offering_id: r.offering_id,
      staff_id: r.staff_id,
      staff_name: (st as { name?: string } | undefined)?.name ?? null,
      title: String((off as { title?: string })?.title ?? "Service"),
      duration_minutes: Number((off as { duration_minutes?: number })?.duration_minutes ?? 60),
      buffer_minutes: Number((off as { buffer_minutes?: number })?.buffer_minutes ?? 0),
      reminder_to_rebook_enabled: Boolean((off as { reminder_to_rebook_enabled?: boolean })?.reminder_to_rebook_enabled),
      reminder_to_rebook_weeks: Math.max(1, Number((off as { reminder_to_rebook_weeks?: number })?.reminder_to_rebook_weeks ?? 4)),
    };
  });
  if (services.length === 0) return null;

  const primary = services[0];
  const snapshot = services.map((s) => ({
    offering_id: s.offering_id,
    staff_id: s.staff_id,
    duration_minutes: s.duration_minutes,
    buffer_minutes: s.buffer_minutes,
    title: s.title,
  }));

  let totalBlocked = 0;
  for (const s of services) {
    totalBlocked += s.duration_minutes + s.buffer_minutes;
  }

  const locType = String((booking as { location_type?: string }).location_type ?? "at_salon");
  const locationType = locType === "at_home" ? "at_home" : "at_salon";

  return {
    booking: booking as Record<string, unknown>,
    provider: {
      id: provider.id,
      slug: provider.slug,
      business_name: String(provider.business_name ?? ""),
      business_type: String(provider.business_type ?? "salon"),
      timezone: String(provider.timezone ?? "Africa/Johannesburg"),
    },
    customer: {
      id: customer.id as string,
      email: (customer as { email?: string }).email ?? null,
      phone: (customer as { phone?: string }).phone ?? null,
      full_name: (customer as { full_name?: string }).full_name ?? null,
    },
    services,
    snapshot,
    rebookLines: services.map((s) => ({ offering_id: s.offering_id, staff_id: s.staff_id })),
    locationType,
    locationId: (booking as { location_id?: string | null }).location_id ?? null,
    totalBlockedMinutes: totalBlocked,
    primary,
    isGroup: Boolean((booking as { is_group_booking?: boolean }).is_group_booking),
  };
}

async function pickSuggestedSlot(
  supabase: SupabaseClient,
  ctx: BookingContext,
  weeks: number,
): Promise<{ startAt: string; endAt: string; dateYmd: string; staffId: string | null } | null> {
  const completedAt = (ctx.booking.completed_at as string | null) ?? new Date().toISOString();
  const tz = ctx.provider.timezone;
  const anchorYmd = formatInTz(new Date(completedAt), "yyyy-MM-dd", tz);
  const staffNames = ctx.services.map((s) => s.staff_name).filter(Boolean) as string[];
  const staffIds = [...new Set(ctx.services.map((s) => s.staff_id).filter(Boolean))] as string[];
  const staffIdParam =
    staffIds.length === 1 ? staffIds[0]! : staffIds.length === 0 ? "any" : staffIds[0]!;

  const { data: staffRows } = await supabase
    .from("provider_staff")
    .select("id")
    .eq("provider_id", ctx.provider.id)
    .eq("is_active", true);

  const candidateDates: string[] = [];
  const cadenceDate = addDaysToYmd(anchorYmd, weeks * 7);
  candidateDates.push(cadenceDate);
  candidateDates.push(addDaysToYmd(cadenceDate, 1));
  candidateDates.push(addDaysToYmd(cadenceDate, 2));

  for (const dateYmd of candidateDates) {
    const slots = await computePublicSlugAvailabilitySlots({
      supabase,
      providerId: ctx.provider.id,
      date: dateYmd,
      totalBlockedMinutes: ctx.totalBlockedMinutes,
      travelBufferMinutes: 0,
      locationId: ctx.locationType === "at_salon" ? ctx.locationId : null,
      staffIdParam,
      activeStaffRows: (staffRows ?? []).map((r) => ({ id: (r as { id: string }).id })),
      providerTimeZone: tz,
    });
    const open = slots.find((s) => s.is_available && s.start && s.end);
    if (!open?.start || !open.end) continue;
    return {
      startAt: open.start,
      endAt: open.end,
      dateYmd,
      staffId: open.staff_id ?? staffIds[0] ?? null,
    };
  }
  return null;
}

function formatAppointmentLabel(iso: string, tz: string): string {
  return formatInTz(new Date(iso), "EEE d MMM, HH:mm", tz);
}

function formatHoldUntilLabel(untilIso: string, tz: string): string {
  const until = new Date(untilIso);
  const time = formatInTz(until, "HH:mm", tz);
  const untilDay = formatInTz(until, "yyyy-MM-dd", tz);
  const tomorrow = addDaysToYmd(formatInTz(new Date(), "yyyy-MM-dd", tz), 1);
  if (untilDay === tomorrow) return `tomorrow ${time}`;
  return `${formatInTz(until, "EEE d MMM", tz)} ${time}`;
}

function withAnyoneWhenStaffMixed(url: string, uniqueStaffCount: number): string {
  if (uniqueStaffCount === 1) return url;
  const parsed = new URL(url);
  parsed.searchParams.delete("staff");
  parsed.searchParams.set("anyone", "1");
  return parsed.toString();
}

async function resolveChannel(
  supabase: SupabaseClient,
  customerId: string,
  phone: string | null,
  canWhatsApp: boolean,
): Promise<{ channel: RebookOfferPreview["channel"]; reason: string | null }> {
  if (phone?.trim() && canWhatsApp) {
    return { channel: "whatsapp_handoff", reason: null };
  }
  const { data: userRow } = await supabase
    .from("users")
    .select(
      "email, phone, email_notifications_enabled, sms_notifications_enabled, push_notifications_enabled, whatsapp_notifications_enabled, whatsapp_opt_in_at, whatsapp_opted_out_at",
    )
    .eq("id", customerId)
    .maybeSingle();
  const { data: prefs } = await supabase
    .from("user_profiles")
    .select("notification_preferences")
    .eq("user_id", customerId)
    .maybeSingle();

  const order: Array<"sms" | "email" | "push"> = ["sms", "email", "push"];
  for (const ch of order) {
    if (
      channelAllowedForCustomerUser(
        (prefs as { notification_preferences?: Record<string, unknown> } | null)?.notification_preferences ?? null,
        userRow as Record<string, unknown> | null,
        "rebook_offer",
        ch,
      )
    ) {
      return { channel: ch, reason: null };
    }
  }
  return {
    channel: "none",
    reason: phone?.trim()
      ? "Add this client's marketing preferences in the app, or share the link yourself."
      : "No phone or allowed email/SMS on file. Add a number or share the link yourself.",
  };
}

async function cancelActiveRebookHolds(
  supabase: SupabaseClient,
  sourceBookingId: string,
): Promise<void> {
  const { data: offers } = await supabase
    .from("rebook_offers")
    .select("id, hold_id")
    .eq("source_booking_id", sourceBookingId)
    .in("status", ["pending", "handed_to_whatsapp", "sent", "opened"]);
  for (const row of offers ?? []) {
    const holdId = (row as { hold_id?: string | null }).hold_id;
    if (holdId) {
      await supabase
        .from("booking_holds")
        .update({ hold_status: "cancelled" })
        .eq("id", holdId)
        .in("hold_status", ["active", "consuming"]);
    }
    await supabase
      .from("rebook_offers")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", (row as { id: string }).id);
  }
}

export async function previewRebookOffer(
  supabase: SupabaseClient,
  bookingId: string,
  providerId: string,
  userId: string,
  request?: NextRequest,
): Promise<RebookOfferPreview | null> {
  const ctx = await loadBookingContext(supabase, bookingId, providerId);
  if (!ctx) return null;

  const clientFirstName = firstNameFromDisplayName(ctx.customer.full_name);
  const rebookEnabled = ctx.primary.reminder_to_rebook_enabled && !ctx.isGroup;
  const rebookWeeks = rebookEnabled ? ctx.primary.reminder_to_rebook_weeks : null;

  const uniqueStaffIds = [...new Set(ctx.services.map((s) => s.staff_id).filter(Boolean))] as string[];
  const staffNames = ctx.services.map((s) => s.staff_name).filter(Boolean) as string[];
  const bookWith = resolveBookWithLabel({
    staffNames,
    businessName: ctx.provider.business_name,
    atHome: ctx.locationType === "at_home",
  });

  let suggested: Awaited<ReturnType<typeof pickSuggestedSlot>> = null;
  if (rebookEnabled && rebookWeeks && uniqueStaffIds.length <= 1) {
    suggested = await pickSuggestedSlot(supabase, ctx, rebookWeeks);
  }

  const appBase = getAppBaseUrl().replace(/\/$/, "");
  const link = withAnyoneWhenStaffMixed(
    buildAbsoluteRebookLink(
      appBase,
      ctx.provider.slug,
      ctx.rebookLines,
      { locationId: ctx.locationId, locationType: ctx.locationType },
      {
        holdId: undefined,
        dateYmd: suggested?.dateYmd,
        step: suggested ? "calendar" : undefined,
      },
    ),
    uniqueStaffIds.length,
  );

  const holdUntilIso = suggested ? new Date(Date.now() + REBOOK_HOLD_MS).toISOString() : null;
  const messageBody = buildRebookOfferClientMessage({
    clientFirstName,
    primaryServiceTitle: ctx.primary.title,
    multiService: ctx.services.length > 1,
    rebookWeeks,
    bookWithLabel: bookWith,
    atHome: ctx.locationType === "at_home",
    holdAppointmentLabel: suggested ? formatAppointmentLabel(suggested.startAt, ctx.provider.timezone) : null,
    holdConfirmUntilLabel:
      suggested && holdUntilIso ? formatHoldUntilLabel(holdUntilIso, ctx.provider.timezone) : null,
    link,
  });

  const providerHint = buildRebookOfferProviderHint({
    clientFirstName,
    primaryServiceTitle: ctx.primary.title,
    multiService: ctx.services.length > 1,
    rebookWeeks,
    bookWithLabel: bookWith,
    holdAppointmentLabel: suggested
      ? formatAppointmentLabel(suggested.startAt, ctx.provider.timezone)
      : null,
  });

  const canWhatsApp = await rebookOfferWhatsAppHandoffAllowed(userId, providerId, request);
  const { channel, reason } = await resolveChannel(
    supabase,
    ctx.customer.id,
    ctx.customer.phone,
    canWhatsApp,
  );
  const canSeeContact = await rebookOfferCanSeeClientContact(userId, request);
  const masked =
    canSeeContact && ctx.customer.phone?.trim()
      ? maskPhoneForDisplay(ctx.customer.phone)
      : null;

  const { data: existing } = await supabase
    .from("rebook_offers")
    .select("id, status, opened_at, sent_at, booked_at")
    .eq("source_booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    customerUserId: ctx.customer.id,
    clientFirstName,
    primaryServiceTitle: ctx.primary.title,
    rebookWeeks,
    rebookEnabled,
    multiService: ctx.services.length > 1,
    providerHint,
    messageBody,
    link,
    channel,
    channelReason: reason,
    maskedDestination: masked,
    canWhatsAppHandoff: canWhatsApp && Boolean(ctx.customer.phone?.trim()),
    canEditMessage: true,
    canEditClientPhone: await rebookOfferCanEditClientPhone(userId, request),
    hasClientPhone: Boolean(ctx.customer.phone?.trim()),
    suggestedSlot: suggested
      ? { startAt: suggested.startAt, endAt: suggested.endAt, dateYmd: suggested.dateYmd, staffId: suggested.staffId }
      : null,
    existingOffer: existing
      ? {
          id: (existing as { id: string }).id,
          status: String((existing as { status: string }).status),
          openedAt: (existing as { opened_at?: string }).opened_at ?? null,
          sentAt: (existing as { sent_at?: string }).sent_at ?? null,
          bookedAt: (existing as { booked_at?: string }).booked_at ?? null,
        }
      : null,
  };
}

export async function confirmRebookOffer(
  supabase: SupabaseClient,
  bookingId: string,
  providerId: string,
  userId: string,
  opts: { messageOverride?: string; clientPhone?: string; deliver?: "channel" | "self" },
  request?: NextRequest,
): Promise<
  | {
      ok: true;
      offerId: string;
      channel: RebookOfferPreview["channel"] | "share";
      whatsappUrl: string | null;
      messageBody: string;
      link: string;
    }
  | { ok: false; code: string; message: string }
> {
  if (opts.clientPhone?.trim() && (await rebookOfferCanEditClientPhone(userId, request))) {
    const ctxPhone = await loadBookingContext(supabase, bookingId, providerId);
    if (ctxPhone) {
      await supabase.from("users").update({ phone: opts.clientPhone.trim() }).eq("id", ctxPhone.customer.id);
    }
  }

  const preview = await previewRebookOffer(supabase, bookingId, providerId, userId, request);
  if (!preview) return { ok: false, code: "NOT_FOUND", message: "Booking not found" };
  const deliverSelf = opts.deliver === "self";
  if (!deliverSelf && preview.channel === "none" && !preview.canWhatsAppHandoff) {
    return { ok: false, code: "NO_CHANNEL", message: preview.channelReason ?? "No delivery channel" };
  }

  const ctx = await loadBookingContext(supabase, bookingId, providerId);
  if (!ctx) return { ok: false, code: "NOT_FOUND", message: "Booking not found" };

  await cancelActiveRebookHolds(supabase, bookingId);

  let holdId: string | null = null;
  let suggested = preview.suggestedSlot;
  if (preview.rebookEnabled && suggested && !ctx.isGroup) {
    const hasOverlap = await checkActiveHoldOverlap(
      supabase,
      ctx.provider.id,
      new Date(suggested.startAt),
      new Date(suggested.endAt),
      { dbStaffId: suggested.staffId ?? ctx.services[0]?.staff_id ?? null },
    );
    if (!hasOverlap) {
      const expiresAt = new Date(Date.now() + REBOOK_HOLD_MS).toISOString();
      const gridDur = holdGridDurationMinutesFromSnapshot({
        startAt: new Date(suggested.startAt),
        snapshotLines: ctx.snapshot as never[],
        bufferMinutesByOfferingId: new Map(
          ctx.services.map((s) => [s.offering_id, s.buffer_minutes]),
        ),
      });
      const slotOk = await assertPublicSlotBookable(supabase, {
        providerId: ctx.provider.id,
        scheduledAt: new Date(suggested.startAt),
        durationMinutes: gridDur,
        staffIdsCsv: ctx.services.map((s) => s.staff_id).filter(Boolean).join(",") || null,
        locationId: ctx.locationType === "at_salon" ? ctx.locationId : null,
        mode: ctx.locationType === "at_home" ? "mobile" : "salon",
        travelBufferRaw: "0",
        resourceOfferingIds: ctx.services.map((s) => s.offering_id),
      });
      if (slotOk.ok) {
        const { data: hold, error } = await supabase
          .from("booking_holds")
          .insert({
            provider_id: ctx.provider.id,
            staff_id: suggested.staffId ?? ctx.services[0]?.staff_id ?? null,
            booking_services_snapshot: ctx.snapshot,
            start_at: suggested.startAt,
            end_at: suggested.endAt,
            location_type: ctx.locationType,
            location_id: ctx.locationId,
            hold_status: "active",
            expires_at: expiresAt,
            metadata: {
              kind: "rebook_offer",
              source_booking_id: bookingId,
              client_first_name: preview.clientFirstName,
            },
          })
          .select("id")
          .single();
        if (!error && hold) holdId = (hold as { id: string }).id;
      }
    }
    if (!holdId) suggested = null;
  }

  const appBase = getAppBaseUrl().replace(/\/$/, "");
  const channel = deliverSelf
    ? "share"
    : preview.canWhatsAppHandoff && ctx.customer.phone?.trim()
      ? "whatsapp_handoff"
      : preview.channel;
  const now = new Date().toISOString();
  const status =
    channel === "whatsapp_handoff" ? "handed_to_whatsapp" : channel === "sms" || channel === "email" || channel === "push" ? "sent" : "pending";

  let messageBody = opts.messageOverride?.trim() || preview.messageBody;

  const { data: inserted, error: insertErr } = await supabase
    .from("rebook_offers")
    .insert({
    source_booking_id: bookingId,
    provider_id: providerId,
    customer_id: ctx.customer.id,
    tenant_id: (ctx.booking.tenant_id as string | null) ?? null,
    hold_id: holdId,
    status,
    channel,
    message_body: messageBody,
    link: preview.link,
    sent_by_user_id: userId,
    sent_at: status === "sent" ? now : null,
    metadata: { preview_channel: channel },
    created_at: now,
    updated_at: now,
  })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return { ok: false, code: "CREATE_FAILED", message: "Could not create rebook offer" };
  }

  const offerId = (inserted as { id: string }).id;
  const uniqueStaffIds = [...new Set(ctx.services.map((s) => s.staff_id).filter(Boolean))] as string[];
  const link = withAnyoneWhenStaffMixed(
    buildAbsoluteRebookLink(
      appBase,
      ctx.provider.slug,
      ctx.rebookLines,
      { locationId: ctx.locationId, locationType: ctx.locationType },
      {
        rebookOfferId: offerId,
        holdId: holdId ?? undefined,
        dateYmd: holdId ? suggested?.dateYmd : undefined,
        step: holdId ? "calendar" : undefined,
      },
    ),
    uniqueStaffIds.length,
  );
  const staffNames = ctx.services.map((s) => s.staff_name).filter(Boolean) as string[];
  const bookWith = resolveBookWithLabel({
    staffNames,
    businessName: ctx.provider.business_name,
    atHome: ctx.locationType === "at_home",
  });
  const canonical = buildRebookOfferClientMessage({
    clientFirstName: preview.clientFirstName,
    primaryServiceTitle: ctx.primary.title,
    multiService: ctx.services.length > 1,
    rebookWeeks: preview.rebookWeeks,
    bookWithLabel: bookWith,
    atHome: ctx.locationType === "at_home",
    holdAppointmentLabel:
      holdId && suggested ? formatAppointmentLabel(suggested.startAt, ctx.provider.timezone) : null,
    holdConfirmUntilLabel:
      holdId && suggested ? formatHoldUntilLabel(new Date(Date.now() + REBOOK_HOLD_MS).toISOString(), ctx.provider.timezone) : null,
    link,
  });
  const edited = Boolean(opts.messageOverride?.trim()) && opts.messageOverride!.trim() !== preview.messageBody.trim();
  if (!edited) {
    messageBody = canonical;
  } else {
    let editedBody = messageBody.split(preview.link).join(" ");
    editedBody = editedBody.split(link).join(" ");
    if (!holdId) {
      editedBody = editedBody.replace(/\s*[^.]*\bis held for you\b[^.]*\./gi, " ");
    }
    messageBody = ensureSingleLinkInMessage(editedBody.replace(/\s+/g, " ").trim(), link);
  }
  await supabase.from("rebook_offers").update({ message_body: messageBody, link }).eq("id", offerId);

  if (holdId) {
    await supabase
      .from("booking_holds")
      .update({
        metadata: {
          kind: "rebook_offer",
          rebook_offer_id: offerId,
          source_booking_id: bookingId,
          client_first_name: preview.clientFirstName,
        },
      })
      .eq("id", holdId);
  }

  let whatsappUrl: string | null = null;
  if (channel === "whatsapp_handoff" && ctx.customer.phone?.trim()) {
    const digits = ctx.customer.phone.replace(/\D/g, "");
    whatsappUrl = `https://wa.me/${digits}?text=${encodeURIComponent(messageBody)}`;
    return { ok: true, offerId, channel, whatsappUrl, messageBody, link };
  }

  if (channel === "sms" || channel === "email" || channel === "push") {
    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    await sendTemplateNotification(
      "rebook_offer",
      [ctx.customer.id],
      {
        message_body: messageBody,
        business_name: ctx.provider.business_name,
        link,
        customer_first_name: preview.clientFirstName,
      },
      [channel],
      { appType: "customer", skipInApp: false, tenantId: (ctx.booking.tenant_id as string | null) ?? null },
    );
  }

  return { ok: true, offerId, channel, whatsappUrl, messageBody, link };
}

export async function cancelRebookOfferForBooking(
  supabase: SupabaseClient,
  bookingId: string,
  providerId: string,
): Promise<void> {
  const { data: row } = await supabase
    .from("rebook_offers")
    .select("id, hold_id")
    .eq("source_booking_id", bookingId)
    .eq("provider_id", providerId)
    .in("status", ["pending", "handed_to_whatsapp", "sent", "opened"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return;
  const holdId = (row as { hold_id?: string | null }).hold_id;
  if (holdId) {
    await supabase
      .from("booking_holds")
      .update({ hold_status: "cancelled" })
      .eq("id", holdId)
      .in("hold_status", ["active", "consuming"]);
  }
  await supabase
    .from("rebook_offers")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", (row as { id: string }).id);
}

export async function markRebookOfferOpened(supabase: SupabaseClient, offerId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("rebook_offers")
    .update({ status: "opened", opened_at: now, updated_at: now })
    .eq("id", offerId)
    .in("status", ["handed_to_whatsapp", "sent", "pending"]);
}

export async function markRebookOfferBooked(
  supabase: SupabaseClient,
  offerId: string,
  resultingBookingId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("rebook_offers")
    .update({
      status: "booked",
      booked_at: now,
      resulting_booking_id: resultingBookingId,
      updated_at: now,
    })
    .eq("id", offerId);
}