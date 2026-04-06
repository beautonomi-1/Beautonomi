/**
 * Shared transformation from `/api/provider/bookings` rows to calendar `Appointment[]`.
 * Used by ProviderApiClient.listAppointments and server-side calendar initial fetch.
 */

import { format as formatDate } from "date-fns";
import { APPOINTMENT_STATUS } from "./constants";
import type { Appointment } from "./types";
import type { FilterParams, PaginationParams, PaginatedResponse } from "./types";

export function mapAppointmentStatusFromBooking(booking: {
  status?: string;
  db_status?: string;
}): { status: Appointment["status"]; db_status?: Appointment["db_status"] } {
  let status: Appointment["status"] = APPOINTMENT_STATUS.BOOKED;
  if (booking.status === "completed") status = APPOINTMENT_STATUS.COMPLETED;
  else if (booking.status === "cancelled") status = APPOINTMENT_STATUS.CANCELLED;
  else if (booking.status === "in_progress" || booking.status === "started") status = APPOINTMENT_STATUS.STARTED;
  else if (booking.status === "no_show") status = APPOINTMENT_STATUS.NO_SHOW;
  else if (booking.db_status === "pending") status = APPOINTMENT_STATUS.PENDING;
  else if (booking.status === "pending") status = APPOINTMENT_STATUS.PENDING;

  const out: { status: Appointment["status"]; db_status?: Appointment["db_status"] } = { status };
  if (
    booking.db_status === "pending" ||
    booking.db_status === "confirmed" ||
    booking.db_status === "in_progress" ||
    booking.db_status === "completed" ||
    booking.db_status === "cancelled" ||
    booking.db_status === "no_show"
  ) {
    out.db_status = booking.db_status as Appointment["db_status"];
  }
  return out;
}

function createAppointmentFromBookingRow(
  booking: any,
  svc: any,
  idx: number,
  expandForCalendar: boolean,
): Appointment {
  const scheduledAt = svc.scheduled_start_at ? new Date(svc.scheduled_start_at) : new Date(booking.scheduled_at);
  const scheduledDate = formatDate(scheduledAt, "yyyy-MM-dd");
  const scheduledTime = formatDate(scheduledAt, "HH:mm");
  const serviceName = svc.offering_name || svc.name || "Service";
  const serviceId = svc.offering_id || svc.id || "";
  const durationMinutes = svc.duration_minutes || 60;
  const staffId = svc.staff_id || booking.staff_id || "";
  const staffName = svc.staff_name || svc.staff?.name || booking.staff_name || "";

  const customer = booking.customers || {};
  const clientName = customer.full_name || "Client";
  const clientEmail = customer.email || "";
  const clientPhone = customer.phone || "";

  const { status, db_status } = mapAppointmentStatusFromBooking(booking);

  const location = booking.locations || {};
  const locationName = location.name || "";
  const address = booking.address || {};

  const isExpanded = expandForCalendar && (booking.services?.length || 0) > 1;
  const aptId = isExpanded ? `${booking.id}-svc-${idx}` : booking.id;

  return {
    id: aptId,
    ...(isExpanded && { booking_id: booking.id }),
    ref_number: booking.booking_number || booking.id,
    client_id: booking.customer_id || customer.id || "",
    client_name: clientName,
    client_email: clientEmail,
    client_phone: clientPhone,
    service_id: serviceId,
    service_name: serviceName,
    team_member_id: staffId,
    team_member_name: staffName,
    scheduled_date: scheduledDate,
    scheduled_time: scheduledTime,
    duration_minutes: durationMinutes,
    price: booking.total_amount || booking.subtotal || svc.price || 0,
    status,
    created_by: booking.created_by || "Online Booking",
    created_date: booking.created_at || new Date().toISOString(),
    notes: booking.special_requests || "",
    cancellation_reason: booking.cancellation_reason,
    location_type: booking.location_type || "at_salon",
    location_id: booking.location_id || "",
    location_name: locationName,
    address_line1: address.line1 || booking.address_line1 || "",
    address_line2: address.line2 || booking.address_line2 || "",
    address_city: address.city || booking.address_city || "",
    address_state: address.state || booking.address_state || "",
    address_country: address.country || booking.address_country || "",
    address_postal_code: address.postal_code || booking.address_postal_code || "",
    address_latitude: address.latitude ?? booking.address_latitude,
    address_longitude: address.longitude ?? booking.address_longitude,
    apartment_unit: address.apartment_unit ?? booking.apartment_unit ?? null,
    building_name: address.building_name ?? booking.building_name ?? null,
    floor_number: address.floor_number ?? booking.floor_number ?? null,
    access_codes: address.access_codes ?? booking.access_codes ?? null,
    parking_instructions: address.parking_instructions ?? booking.parking_instructions ?? null,
    location_landmarks: address.location_landmarks ?? booking.location_landmarks ?? null,
    house_call_instructions: booking.house_call_instructions ?? null,
    current_stage: booking.current_stage,
    travel_fee: booking.travel_fee || 0,
    payment_status: booking.payment_status,
    tip_amount: booking.tip_amount || 0,
    original_price: svc.price || booking.subtotal || 0,
    discount_amount: booking.discount_amount || 0,
    discount_code: booking.discount_code || "",
    discount_reason: booking.discount_reason || "",
    subtotal: booking.subtotal || svc.price || 0,
    tax_amount: booking.tax_amount || 0,
    total_amount: booking.total_amount || booking.subtotal || svc.price || 0,
    service_customization: booking.service_customization || svc.customization || "",
    updated_date: booking.updated_at || "",
    updated_by: booking.updated_by || "",
    updated_by_name: booking.updated_by_name || "",
    client_since: customer.created_at || "",
    ...(booking.version !== undefined && { version: booking.version }),
    ...(booking.is_group_booking && { is_group_booking: true, group_booking_ref: booking.group_booking_ref || null }),
    ...(db_status !== undefined ? { db_status } : {}),
    ...(booking.provider_form_responses != null &&
    typeof booking.provider_form_responses === "object" &&
    Object.keys(booking.provider_form_responses).length > 0
      ? { provider_form_responses: booking.provider_form_responses }
      : {}),
  };
}

/**
 * Mirrors ProviderApiClient.listAppointments transformation (fetch + paginate happens in caller).
 */
export function transformBookingRowsToAppointments(
  bookings: any[],
  filters?: FilterParams,
  pagination?: PaginationParams,
): PaginatedResponse<Appointment> {
  const expandForCalendar = !!filters?.expand_for_calendar;

  const appointments: Appointment[] = [];
  for (const booking of bookings) {
    const services = booking.services || [];
    if (expandForCalendar && services.length > 0) {
      services.forEach((svc: any, idx: number) => {
        appointments.push(createAppointmentFromBookingRow(booking, svc, idx, expandForCalendar));
      });
    } else {
      const firstService = services[0] || {};
      appointments.push(createAppointmentFromBookingRow(booking, firstService, 0, expandForCalendar));
    }
  }

  let filtered = appointments;
  if (filters?.search) {
    const search = (filters.search ?? "").toLowerCase();
    filtered = filtered.filter(
      (a) =>
        (a?.client_name ?? "").toLowerCase().includes(search) ||
        (a?.service_name ?? "").toLowerCase().includes(search) ||
        (a?.ref_number ?? "").toLowerCase().includes(search),
    );
  }

  if (filters?.team_member_id && filters.team_member_id !== "all") {
    filtered = filtered.filter((a) => a.team_member_id === filters.team_member_id);
  }

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;
  const start = (page - 1) * limit;
  const end = start + limit;

  return {
    data: filtered.slice(start, end),
    total: filtered.length,
    page,
    limit,
    total_pages: Math.ceil(filtered.length / limit),
  };
}
