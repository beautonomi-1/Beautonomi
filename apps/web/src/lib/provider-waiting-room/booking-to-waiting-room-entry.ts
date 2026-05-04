/**
 * Map a booking row (with customer + booking_services embeds from Supabase) to the
 * waiting-room API entry shape expected by the provider mobile app.
 */

export type WaitingRoomCustomerEmbed = { full_name?: string | null; email?: string | null; phone?: string | null } | null;

export type WaitingRoomBookingServiceEmbed = {
  offering_id?: string | null;
  staff_id?: string | null;
  scheduled_start_at?: string | null;
  guest_name?: string | null;
  offering?: { title?: string | null } | null;
  staff?: { id?: string; name?: string | null } | null;
};

export type WaitingRoomBookingEmbedRow = {
  id: string;
  booking_number?: string | null;
  scheduled_at?: string | null;
  checked_in_time?: string | null;
  status?: string | null;
  notes?: string | null;
  special_requests?: string | null;
  is_group_booking?: boolean | null;
  group_booking_id?: string | null;
  customers?: WaitingRoomCustomerEmbed | WaitingRoomCustomerEmbed[];
  booking_services?: WaitingRoomBookingServiceEmbed[] | null;
};

export function firstCustomerFromBookingEmbed(b: WaitingRoomBookingEmbedRow): WaitingRoomCustomerEmbed {
  const c = b.customers;
  if (Array.isArray(c)) return c[0] ?? null;
  return c ?? null;
}

export function primaryServiceLineFromBookingEmbed(b: WaitingRoomBookingEmbedRow): {
  serviceId: string | null;
  serviceName: string;
  teamMemberId: string | null;
  teamMemberName: string;
} {
  const raw = b.booking_services;
  const lines = Array.isArray(raw) ? [...raw] : [];
  lines.sort((a, b) => {
    const ta = a.scheduled_start_at ? new Date(a.scheduled_start_at).getTime() : 0;
    const tb = b.scheduled_start_at ? new Date(b.scheduled_start_at).getTime() : 0;
    return ta - tb;
  });
  const primary = lines[0];
  const title = primary?.offering?.title?.trim();
  const guest = primary?.guest_name?.trim();
  const serviceName = title || guest || "Service";
  const staffName = primary?.staff?.name?.trim() || "Staff";
  return {
    serviceId: primary?.offering_id ?? null,
    serviceName,
    teamMemberId: primary?.staff_id ?? null,
    teamMemberName: staffName,
  };
}

export function waitingRoomStatusFromBookingStatus(status: string | null | undefined): "waiting" | "in_service" | "completed" | "left" {
  const s = (status || "").toLowerCase();
  if (s === "in_progress" || s === "started") return "in_service";
  if (s === "completed") return "completed";
  if (s === "cancelled" || s === "no_show") return "left";
  return "waiting";
}

export function mapBookingEmbedToWaitingRoomEntry(booking: WaitingRoomBookingEmbedRow) {
  const cust = firstCustomerFromBookingEmbed(booking);
  const line = primaryServiceLineFromBookingEmbed(booking);
  const clientName = cust?.full_name?.trim() || booking.special_requests?.trim()?.slice(0, 80) || "Guest";
  const wrStatus = waitingRoomStatusFromBookingStatus(booking.status);

  return {
    id: booking.id,
    appointment_id: booking.id,
    client_name: clientName,
    client_email: cust?.email ?? undefined,
    client_phone: cust?.phone ?? undefined,
    service_id: line.serviceId,
    service_name: line.serviceName,
    team_member_id: line.teamMemberId,
    team_member_name: line.teamMemberName,
    checked_in_time: booking.checked_in_time || booking.scheduled_at,
    checked_in_method: "staff" as const,
    status: wrStatus,
    notes: booking.notes,
    position: undefined,
    estimated_wait_time: undefined,
    is_group_booking: Boolean(booking.is_group_booking),
    group_booking_id: booking.group_booking_id ?? null,
  };
}

/** Supabase `.select()` fragment for booking → waiting-room mapping (no invalid denormalized columns). */
export const WAITING_ROOM_BOOKING_SELECT = `
  id,
  booking_number,
  customer_id,
  scheduled_at,
  checked_in_time,
  status,
  notes,
  special_requests,
  is_group_booking,
  group_booking_id,
  customers:users!bookings_customer_id_fkey(full_name, email, phone),
  booking_services(
    offering_id,
    staff_id,
    scheduled_start_at,
    guest_name,
    offering:offerings(title),
    staff:provider_staff(id, name)
  )
`.trim();
