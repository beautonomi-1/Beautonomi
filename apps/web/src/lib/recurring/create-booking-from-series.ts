import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveTaxRate } from "@/lib/platform-tax-settings";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { determineAppointmentStatusFromDB } from "@/lib/provider-portal/appointment-settings";
import { checkBookingConflict, canOverrideDoubleBooking } from "@/lib/bookings/conflict-check";

type SeriesRow = {
  id: string;
  provider_id: string;
  customer_id: string | null;
  service_id: string | null;
  staff_id: string | null;
  location_id: string | null;
  metadata?: unknown;
  notes?: string | null;
};

type ServiceLine = { offering_id: string; staff_id?: string | null };

function toHhMmSs(t: string | null | undefined): string {
  const s = (t || "10:00:00").trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return "10:00:00";
}

function mapPortalStatusToDb(portalStatus: string): string {
  if (portalStatus === "booked") return "confirmed";
  if (portalStatus === "started") return "in_progress";
  return portalStatus;
}

function resolveServiceLines(row: SeriesRow): ServiceLine[] {
  const meta = row.metadata as { services?: ServiceLine[] } | null;
  if (Array.isArray(meta?.services) && meta!.services!.length > 0) {
    return meta!.services!.filter((s) => s?.offering_id);
  }
  if (row.service_id) {
    return [{ offering_id: row.service_id, staff_id: row.staff_id }];
  }
  return [];
}

const BUFFER_MINUTES = 15;

/**
 * Create a single booking (+ booking_services) from a recurring series row. Does not charge payment.
 */
export async function createBookingFromRecurringSeries(
  admin: SupabaseClient,
  row: SeriesRow & {
    location_type?: string | null;
    preferred_time?: string | null;
    start_time?: string | null;
  },
  occurrenceDateYmd: string
): Promise<{ bookingId: string } | { error: string }> {
  if (!row.customer_id) {
    return { error: "missing_customer" };
  }

  const lines = resolveServiceLines(row);
  if (lines.length === 0) {
    return { error: "no_services" };
  }

  const timeStr = toHhMmSs(row.start_time || row.preferred_time);
  const scheduledAtLocal = new Date(`${occurrenceDateYmd}T${timeStr}`);

  const { data: providerRow } = await admin
    .from("providers")
    .select("tenant_id, currency")
    .eq("id", row.provider_id)
    .maybeSingle();

  const currency =
    (providerRow as { currency?: string | null } | null)?.currency?.trim() || LAST_RESORT_CURRENCY;

  const offeringIds = [...new Set(lines.map((l) => l.offering_id))];
  const { data: offerings, error: offErr } = await admin
    .from("offerings")
    .select("id, price, duration_minutes, currency")
    .in("id", offeringIds)
    .eq("provider_id", row.provider_id);

  if (offErr || !offerings?.length) {
    return { error: `offerings_load_failed: ${offErr?.message || "none"}` };
  }

  const offeringMap = new Map(offerings.map((o: { id: string }) => [o.id, o]));

  let subtotal = 0;
  for (const line of lines) {
    const o = offeringMap.get(line.offering_id) as { price?: number } | undefined;
    if (!o) return { error: `unknown_offering:${line.offering_id}` };
    subtotal += Number(o.price || 0);
  }

  const taxRate = await getEffectiveTaxRate(row.provider_id);
  const taxAmount = Math.round(subtotal * (Number(taxRate) / 100) * 100) / 100;
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

  const portalStatus = await determineAppointmentStatusFromDB(admin, row.provider_id);
  const dbStatus = mapPortalStatusToDb(portalStatus);

  let cursor = new Date(scheduledAtLocal);
  const pBookingServices: Record<string, unknown>[] = [];
  for (const line of lines) {
    const o = offeringMap.get(line.offering_id) as {
      duration_minutes?: number;
      price?: number;
      currency?: string;
    };
    const duration = Number(o.duration_minutes || 60);
    const price = Number(o.price || 0);
    const cur = o.currency || currency;
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + duration * 60 * 1000);
    const staffId = line.staff_id ?? row.staff_id ?? null;
    pBookingServices.push({
      offering_id: line.offering_id,
      staff_id: staffId,
      duration_minutes: duration,
      price,
      currency: cur,
      scheduled_start_at: start.toISOString(),
      scheduled_end_at: end.toISOString(),
    });
    cursor = end;
  }

  const primaryStaffId =
    (pBookingServices[0]?.staff_id as string | null | undefined) ?? row.staff_id ?? null;

  const startAt = new Date(pBookingServices[0]!.scheduled_start_at as string);
  const lastEnd = new Date(pBookingServices[pBookingServices.length - 1]!.scheduled_end_at as string);
  const endAt = new Date(lastEnd.getTime() + BUFFER_MINUTES * 60 * 1000);

  const allowOverride = await canOverrideDoubleBooking(admin, row.provider_id);
  if (primaryStaffId && !allowOverride) {
    const conflict = await checkBookingConflict(admin, primaryStaffId, startAt, endAt, 0);
    if (conflict.hasConflict) {
      return { error: "slot_conflict" };
    }
  }

  const metaAddr = row.metadata as { address?: Record<string, unknown> } | null;
  const addr = metaAddr?.address;

  const locationType = (row.location_type || "at_salon") as string;

  const bookingData: Record<string, unknown> = {
    customer_id: row.customer_id,
    provider_id: row.provider_id,
    tenant_id: (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
    booking_number: "",
    scheduled_at: scheduledAtLocal.toISOString(),
    location_type: locationType,
    location_id: row.location_id,
    booking_source: "online",
    address_line1: typeof addr === "object" && addr && "line1" in addr ? String((addr as { line1?: string }).line1) : null,
    address_city: typeof addr === "object" && addr && "city" in addr ? String((addr as { city?: string }).city) : null,
    address_country: typeof addr === "object" && addr && "country" in addr ? String((addr as { country?: string }).country) : null,
    address_postal_code:
      typeof addr === "object" && addr && "postal_code" in addr ? String((addr as { postal_code?: string }).postal_code) : null,
    address_latitude:
      typeof addr === "object" && addr && "latitude" in addr ? Number((addr as { latitude?: number }).latitude) : null,
    address_longitude:
      typeof addr === "object" && addr && "longitude" in addr ? Number((addr as { longitude?: number }).longitude) : null,
    subtotal,
    discount_amount: 0,
    promotion_discount_amount: 0,
    membership_discount_amount: 0,
    tax_amount: taxAmount,
    tax_rate: taxRate,
    tip_amount: 0,
    total_amount: totalAmount,
    currency,
    status: dbStatus,
    payment_status: "pending",
    special_requests: row.notes || null,
    loyalty_points_earned: 0,
    travel_fee: 0,
    service_fee_percentage: 0,
    service_fee_amount: 0,
    service_fee_paid_by: "customer",
  };

  if (primaryStaffId && !allowOverride) {
    const { data: bookingId, error: rpcError } = await admin.rpc("create_booking_with_locking", {
      p_booking_data: bookingData,
      p_booking_services: pBookingServices,
      p_staff_id: primaryStaffId,
      p_start_at: startAt.toISOString(),
      p_end_at: endAt.toISOString(),
      p_entitlement_id: null,
      p_entitlement_customer_id: null,
    });

    if (rpcError) {
      const msg = (rpcError as { message?: string }).message ?? "";
      if (msg.includes("BOOKING_SLOT_CONFLICT")) {
        return { error: "slot_conflict" };
      }
      return { error: msg || "rpc_failed" };
    }
    if (!bookingId) {
      return { error: "rpc_no_id" };
    }

    await admin
      .from("bookings")
      .update({
        booking_source: "online",
        tenant_id: (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
      })
      .eq("id", bookingId as string);

    return { bookingId: bookingId as string };
  }

  const { data: inserted, error: bErr } = await admin.from("bookings").insert(bookingData).select("id").single();

  if (bErr || !inserted) {
    return { error: bErr?.message || "insert_failed" };
  }

  const bookingId = (inserted as { id: string }).id;

  const bsRows = pBookingServices.map((s) => ({
    booking_id: bookingId,
    offering_id: s.offering_id,
    staff_id: s.staff_id,
    duration_minutes: s.duration_minutes,
    price: s.price,
    currency: s.currency,
    scheduled_start_at: s.scheduled_start_at,
    scheduled_end_at: s.scheduled_end_at,
  }));

  const { error: bsErr } = await admin.from("booking_services").insert(bsRows);
  if (bsErr) {
    await admin.from("bookings").delete().eq("id", bookingId);
    return { error: `booking_services_failed: ${bsErr.message}` };
  }

  return { bookingId };
}
