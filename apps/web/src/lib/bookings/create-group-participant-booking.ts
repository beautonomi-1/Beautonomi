import type { SupabaseClient } from "@supabase/supabase-js";
import { addMinutes } from "date-fns";

export type GroupParticipantBookingInput = {
  customerId: string;
  serviceId: string | null;
  serviceName?: string | null;
  price: number;
  durationMinutes: number;
  addons?: unknown[];
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
  // Travel fee is carried by the group session row, not the child bookings,
  // so customers see the correct per-person price without inflated totals.
  const travelFee = 0;
  const totalAmount = price;

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
    travel_fee: 0,
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
}
