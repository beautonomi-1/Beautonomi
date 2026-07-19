import type { SupabaseClient } from "@supabase/supabase-js";
import { addMinutes } from "date-fns";
import { ensureWalkInCustomerLinkedForProductSale } from "@/lib/provider/ensure-walk-in-customer-for-product-sale";

export type GroupParticipantBookingInput = {
  customerId: string;
  serviceId: string | null;
  serviceName?: string | null;
  price: number;
  durationMinutes: number;
  addons?: unknown[];
  /**
   * When true, the session travel fee (`GroupSessionContext.travelFee`) is added
   * to this child booking's total and stored on `bookings.travel_fee`. Used for
   * the primary participant (the "key person" who pays for the whole group) so
   * the at-home travel fee is actually collected via mark_paid and refundable —
   * instead of being stranded on `group_bookings.travel_fee` with no invoice.
   */
  includeSessionTravelFee?: boolean;
};

export type GroupSessionContext = {
  providerId: string;
  groupBookingId: string;
  groupRef: string;
  scheduledAt: string;
  staffId: string | null;
  locationId: string | null;
  locationType: "at_home" | "at_salon";
  address?: {
    line1?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    postal_code?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  travelFee?: number;
  currency: string;
  tenantId?: string | null;
};

/**
 * Creates a child `bookings` row for a group participant so customers can see
 * the appointment in GET /api/me/bookings and receive notifications.
 */
export async function createGroupParticipantChildBooking(
  admin: SupabaseClient,
  session: GroupSessionContext,
  participant: GroupParticipantBookingInput
): Promise<{ bookingId: string } | { error: string }> {
  const offeringId = participant.serviceId;
  if (!offeringId) {
    return { error: "Participant service is required to create a booking" };
  }

  const startAt = new Date(session.scheduledAt);
  if (Number.isNaN(startAt.getTime())) {
    return { error: "Invalid scheduled_at" };
  }

  const duration = Math.max(1, participant.durationMinutes || 60);
  const endAt = addMinutes(startAt, duration);
  const price = Math.max(0, Number(participant.price) || 0);
  const locType = session.locationType === "at_home" ? "at_home" : "at_salon";
  // The session travel fee is charged once, on the primary participant's booking
  // (the key person who pays for the group). Other participants carry only their
  // own service price so per-person receipts stay correct.
  const travelFee =
    participant.includeSessionTravelFee && locType === "at_home"
      ? Math.max(0, Number(session.travelFee) || 0)
      : 0;
  const totalAmount = price + travelFee;

  const bookingData: Record<string, unknown> = {
    provider_id: session.providerId,
    customer_id: participant.customerId,
    booking_number: "",
    ...(session.tenantId ? { tenant_id: session.tenantId } : {}),
    scheduled_at: session.scheduledAt,
    location_type: locType,
    location_id: locType === "at_salon" ? session.locationId : null,
    booking_source: "provider",
    address_line1: locType === "at_home" ? session.address?.line1 ?? null : null,
    address_city: locType === "at_home" ? session.address?.city ?? null : null,
    address_state: locType === "at_home" ? session.address?.state ?? null : null,
    address_country: locType === "at_home" ? session.address?.country ?? null : null,
    address_postal_code: locType === "at_home" ? session.address?.postal_code ?? null : null,
    address_latitude:
      locType === "at_home" && session.address?.latitude != null
        ? Number(session.address.latitude)
        : null,
    address_longitude:
      locType === "at_home" && session.address?.longitude != null
        ? Number(session.address.longitude)
        : null,
    subtotal: price,
    discount_amount: 0,
    promotion_discount_amount: 0,
    membership_discount_amount: 0,
    tax_amount: 0,
    tax_rate: 0,
    tip_amount: 0,
    total_amount: totalAmount,
    currency: session.currency,
    status: "confirmed",
    payment_status: "pending",
    special_requests: `Group booking ${session.groupRef}`,
    loyalty_points_earned: 0,
    travel_fee: travelFee,
    group_booking_id: session.groupBookingId,
    is_group_booking: true,
  };

  // Direct insert: parent group session already passed availability checks;
  // RPC locking would reject overlapping participant slots on the same staff/time.
  const { data: insertedBooking, error: insertError } = await admin
    .from("bookings")
    .insert(bookingData)
    .select("id")
    .single();

  if (insertError || !insertedBooking?.id) {
    const msg =
      (insertError as { message?: string } | null)?.message ??
      "Failed to create participant booking";
    return { error: msg };
  }

  const id = String(insertedBooking.id);

  const { error: bsError } = await admin.from("booking_services").insert({
    booking_id: id,
    offering_id: offeringId,
    staff_id: session.staffId,
    duration_minutes: duration,
    price,
    currency: session.currency,
    scheduled_start_at: startAt.toISOString(),
    scheduled_end_at: endAt.toISOString(),
  });

  if (bsError) {
    await admin.from("bookings").delete().eq("id", id);
    return { error: bsError.message ?? "Failed to create participant service line" };
  }

  return { bookingId: id };
}

export type AutoInvoiceInlineParticipantsResult = {
  /** How many roster-only participants were turned into child bookings. */
  createdCount: number;
  /** Participants that could not be invoiced, with the reason (e.g. no service). */
  skipped: { participantId: string; reason: string }[];
};

/**
 * Self-heal for group payment: a group can carry "roster-only" participants —
 * `booking_participants` rows with `booking_id IS NULL` (created via the web
 * walk-in flow or inline participant adds, migration 485). Payment attaches to
 * child `bookings`, so a group with only roster rows hits `NOT_INVOICED` and the
 * provider has no way forward. This creates the missing per-participant child
 * bookings (the "invoices") so `mark_paid` can record payment end-to-end.
 *
 * Scope it to groups that have ZERO child bookings: that is exactly the
 * `NOT_INVOICED` case, and it deliberately avoids customer-side online group
 * bookings (which always carry a primary child booking + guest roster rows that
 * must NOT be charged separately).
 */
export async function autoInvoiceInlineGroupParticipants(
  admin: SupabaseClient,
  opts: {
    groupId: string;
    providerId: string;
    staffUserId: string;
    tenantId: string | null;
    currency: string;
  },
): Promise<AutoInvoiceInlineParticipantsResult> {
  const result: AutoInvoiceInlineParticipantsResult = { createdCount: 0, skipped: [] };

  const { data: group, error: groupErr } = await admin
    .from("group_bookings")
    .select(
      "id, ref_number, scheduled_at, service_id, staff_id, location_id, location_type, address_line1, address_city, address_state, address_country, address_postal_code, address_latitude, address_longitude, travel_fee, duration_minutes",
    )
    .eq("id", opts.groupId)
    .eq("provider_id", opts.providerId)
    .maybeSingle();
  if (groupErr || !group) return result;

  const g = group as Record<string, unknown>;

  const { data: participants, error: pErr } = await admin
    .from("booking_participants")
    .select(
      "id, customer_id, participant_name, participant_phone, participant_email, service_id, service_name, price, duration_minutes, addons, is_primary_contact",
    )
    .eq("group_booking_id", opts.groupId)
    .is("booking_id", null);
  if (pErr || !participants || participants.length === 0) return result;

  // The session travel fee is charged once, on the key payer's booking. Prefer
  // the explicit primary contact; fall back to the first participant so an
  // at-home travel fee is never stranded uncollected.
  const primaryParticipantId = (() => {
    const explicit = participants.find(
      (row) => (row as Record<string, unknown>).is_primary_contact === true,
    );
    const chosen = explicit ?? participants[0];
    return chosen ? String((chosen as Record<string, unknown>).id) : null;
  })();

  const locationType = g.location_type === "at_home" ? "at_home" : "at_salon";
  const session: GroupSessionContext = {
    providerId: opts.providerId,
    groupBookingId: String(g.id),
    groupRef: String(g.ref_number ?? g.id),
    scheduledAt: String(g.scheduled_at),
    staffId: (g.staff_id as string | null) ?? null,
    locationId: (g.location_id as string | null) ?? null,
    locationType,
    address:
      locationType === "at_home"
        ? {
            line1: (g.address_line1 as string | null) ?? null,
            city: (g.address_city as string | null) ?? null,
            state: (g.address_state as string | null) ?? null,
            country: (g.address_country as string | null) ?? null,
            postal_code: (g.address_postal_code as string | null) ?? null,
            latitude: g.address_latitude != null ? Number(g.address_latitude) : null,
            longitude: g.address_longitude != null ? Number(g.address_longitude) : null,
          }
        : undefined,
    travelFee: Number(g.travel_fee ?? 0),
    currency: opts.currency,
    tenantId: opts.tenantId,
  };

  const wantsTravelFee = locationType === "at_home" && Number(g.travel_fee ?? 0) > 0;
  let travelFeeApplied = false;
  const createdBookingIds: string[] = [];

  for (const raw of participants) {
    const p = raw as Record<string, unknown>;
    const participantId = String(p.id);
    const serviceId =
      (p.service_id as string | null) || (g.service_id as string | null) || null;
    if (!serviceId) {
      result.skipped.push({ participantId, reason: "missing_service" });
      continue;
    }

    let customerId = (p.customer_id as string | null) || null;
    if (!customerId) {
      const name = (p.participant_name as string | null) ?? null;
      const phone = (p.participant_phone as string | null) ?? null;
      if (!name && !phone) {
        result.skipped.push({ participantId, reason: "missing_customer" });
        continue;
      }
      const walkIn = await ensureWalkInCustomerLinkedForProductSale({
        supabaseAdmin: admin,
        providerId: opts.providerId,
        staffUserId: opts.staffUserId,
        walletCurrency: opts.currency,
        customerName: name,
        customerPhone: phone,
      });
      if (!walkIn.ok) {
        const reason =
          (walkIn as { message?: string }).message ?? "Could not create walk-in customer.";
        result.skipped.push({ participantId, reason });
        continue;
      }
      customerId = walkIn.customerId;
    }

    const carriesTravelFee = wantsTravelFee && participantId === primaryParticipantId;
    const created = await createGroupParticipantChildBooking(admin, session, {
      customerId,
      serviceId,
      serviceName: (p.service_name as string | null) ?? null,
      price: Number(p.price ?? 0) || 0,
      durationMinutes: Number(p.duration_minutes ?? g.duration_minutes ?? 60) || 60,
      addons: Array.isArray(p.addons) ? (p.addons as unknown[]) : [],
      includeSessionTravelFee: carriesTravelFee,
    });
    if ("error" in created) {
      result.skipped.push({ participantId, reason: created.error });
      continue;
    }
    if (carriesTravelFee) travelFeeApplied = true;
    createdBookingIds.push(created.bookingId);

    await admin
      .from("booking_participants")
      .update({ booking_id: created.bookingId, customer_id: customerId })
      .eq("id", participantId);
    result.createdCount += 1;
  }

  // Fallback: the primary participant was skipped (no service/customer), so the
  // travel fee never landed on a booking. Attach it to the first created booking
  // so the at-home travel fee is still collected via mark_paid.
  if (wantsTravelFee && !travelFeeApplied && createdBookingIds.length > 0) {
    const fallbackId = createdBookingIds[0];
    const fee = Number(g.travel_fee ?? 0);
    const { data: fb } = await admin
      .from("bookings")
      .select("total_amount")
      .eq("id", fallbackId)
      .maybeSingle();
    const currentTotal = Number((fb as { total_amount?: number } | null)?.total_amount ?? 0);
    await admin
      .from("bookings")
      .update({
        travel_fee: fee,
        total_amount: currentTotal + fee,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fallbackId);
  }

  return result;
}

export async function notifyGroupParticipantBooking(
  bookingId: string,
  customerId: string,
  providerId: string
): Promise<void> {
  const { insertNotification } = await import("@/lib/notifications/insert-notification");
  const { notifyBookingConfirmed } = await import("@/lib/notifications/notification-service");

  await insertNotification({
    user_id: customerId,
    type: "new_appointment",
    title: "New Appointment Created",
    message: `You have been added to a group appointment.`,
    data: {
      booking_id: bookingId,
      provider_id: providerId,
      is_group_booking: true,
    },
    action_url: `/account-settings/bookings/${bookingId}`,
  }).catch((e) => console.warn("Group participant in-app notification:", e));

  await notifyBookingConfirmed(bookingId, ["email", "push"]).catch((e) =>
    console.warn("Group participant confirmation:", e)
  );

  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const admin = getSupabaseAdmin();
    const { data: bookingRow } = await admin
      .from("bookings")
      .select("booking_number, tenant_id, providers(business_name)")
      .eq("id", bookingId)
      .maybeSingle();
    const providerName =
      (bookingRow as { providers?: { business_name?: string } | Array<{ business_name?: string }> } | null)
        ?.providers;
    const businessName = Array.isArray(providerName)
      ? providerName[0]?.business_name
      : providerName?.business_name;
    const { maybeSendWalkInAppNudge } = await import("@/lib/portal/walk-in-app-nudge");
    await maybeSendWalkInAppNudge({
      supabaseAdmin: admin,
      customerId,
      bookingId,
      bookingNumber: (bookingRow as { booking_number?: string } | null)?.booking_number ?? bookingId.slice(0, 8),
      providerId,
      providerName: businessName ?? "Your salon",
      tenantId: (bookingRow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
      trigger: "booking_created",
    });
  } catch (nudgeErr) {
    console.warn("Group participant walk-in nudge:", nudgeErr);
  }
}
