import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTz, resolveTz } from "@/lib/dates/provider-tz";
import {
  customerFrequencyToRrule,
  preferredTimeToHhMmSs,
  type CustomerRecurringFrequency,
} from "@/lib/recurring/customer-recurring-helpers";

type BookingRow = {
  id: string;
  customer_id: string;
  provider_id: string;
  scheduled_at: string;
  location_type: string;
  location_id: string | null;
  address_line1?: string | null;
  address_city?: string | null;
  address_country?: string | null;
  address_postal_code?: string | null;
  address_latitude?: number | string | null;
  address_longitude?: number | string | null;
  payment_status?: string | null;
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
  promotion_discount_amount?: number | string | null;
  membership_discount_amount?: number | string | null;
  tax_amount?: number | string | null;
  tax_rate?: number | string | null;
  service_fee_percentage?: number | string | null;
  service_fee_amount?: number | string | null;
  tip_amount?: number | string | null;
  travel_fee?: number | string | null;
  total_amount?: number | string | null;
};

type BookingAddonRow = {
  addon_id?: string | null;
  quantity?: number | string | null;
  price?: number | string | null;
  currency?: string | null;
};

/**
 * After a booking exists (and payment succeeded when applicable), create a customer recurring row.
 * Idempotent via `metadata.source_booking_id`.
 */
export async function insertCustomerRecurringSeriesFromPaidBooking(params: {
  admin: SupabaseClient;
  bookingId: string;
  customerId: string;
  frequency: CustomerRecurringFrequency;
  paymentMethod: "card" | "cash";
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { admin, bookingId, customerId, frequency, paymentMethod } = params;

  const { data: existing } = await admin
    .from("recurring_appointments")
    .select("id")
    .eq("customer_id", customerId)
    .contains("metadata", { source_booking_id: bookingId })
    .maybeSingle();

  if (existing) {
    return { ok: true as const };
  }

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select(
      "id, customer_id, provider_id, scheduled_at, location_type, location_id, address_line1, address_city, address_country, address_postal_code, address_latitude, address_longitude, payment_status, subtotal, discount_amount, promotion_discount_amount, membership_discount_amount, tax_amount, tax_rate, service_fee_percentage, service_fee_amount, tip_amount, travel_fee, total_amount",
    )
    .eq("id", bookingId)
    .single();

  if (bErr || !booking) {
    return { ok: false as const, message: bErr?.message || "Booking not found" };
  }

  const b = booking as BookingRow;
  if (b.customer_id !== customerId) {
    return { ok: false as const, message: "Customer mismatch" };
  }
  if (paymentMethod !== "cash" && b.payment_status === "pending") {
    return { ok: false as const, message: "Booking payment has not settled" };
  }

  const { data: svcRows, error: sErr } = await admin
    .from("booking_services")
    .select("offering_id, staff_id")
    .eq("booking_id", bookingId)
    .order("scheduled_start_at", { ascending: true });

  if (sErr) {
    return { ok: false as const, message: sErr.message || "Failed to load services" };
  }
  if (!svcRows?.length) {
    return { ok: false as const, message: "No services on booking" };
  }

  const { data: addonRows, error: addonErr } = await admin
    .from("booking_addons")
    .select("addon_id, quantity, price, currency")
    .eq("booking_id", bookingId);

  if (addonErr) {
    return { ok: false as const, message: addonErr.message || "Failed to load add-ons" };
  }

  const first = svcRows[0] as { offering_id?: string; staff_id?: string | null };
  const offeringId = first?.offering_id?.trim();
  if (!offeringId) {
    return { ok: false as const, message: "Missing offering" };
  }

  const { data: prov } = await admin
    .from("providers")
    .select("timezone")
    .eq("id", b.provider_id)
    .maybeSingle();
  const tz = resolveTz((prov as { timezone?: string | null } | null)?.timezone);

  const startAt = new Date(b.scheduled_at);
  if (Number.isNaN(startAt.getTime())) {
    return { ok: false as const, message: "Invalid booking time" };
  }

  const startYmd = formatInTz(startAt, "yyyy-MM-dd", tz);
  const prefHhmm = formatInTz(startAt, "HH:mm", tz);
  const startTime = preferredTimeToHhMmSs(prefHhmm);

  const services = svcRows
    .map((s) => ({
      offering_id: (s as { offering_id?: string }).offering_id,
      staff_id: (s as { staff_id?: string | null }).staff_id ?? undefined,
    }))
    .filter((s) => Boolean(s.offering_id));
  const addons = ((addonRows ?? []) as BookingAddonRow[])
    .map((a) => ({
      addon_id: a.addon_id,
      quantity: Math.max(1, Math.floor(Number(a.quantity ?? 1)) || 1),
      price: Number(a.price ?? 0) || 0,
      currency: a.currency ?? undefined,
    }))
    .filter((a) => Boolean(a.addon_id));

  const locationType = b.location_type === "at_home" ? ("at_home" as const) : ("at_salon" as const);

  let addrPayload: Record<string, unknown> | undefined;
  if (locationType === "at_home") {
    const line1 = String(b.address_line1 ?? "").trim();
    const city = String(b.address_city ?? "").trim();
    const country = String(b.address_country ?? "ZA").trim();
    if (line1 && city && country) {
      addrPayload = {
        line1,
        city,
        country,
        postal_code: b.address_postal_code != null ? String(b.address_postal_code) : undefined,
        latitude:
          b.address_latitude != null && b.address_latitude !== ""
            ? Number(b.address_latitude)
            : undefined,
        longitude:
          b.address_longitude != null && b.address_longitude !== ""
            ? Number(b.address_longitude)
            : undefined,
      };
    }
  }

  const recurrenceRule = customerFrequencyToRrule(frequency);

  const { data: insertedSeries, error } = await admin
    .from("recurring_appointments")
    .insert({
      provider_id: b.provider_id,
      customer_id: customerId,
      service_id: offeringId,
      staff_id: first.staff_id ?? null,
      recurrence_rule: recurrenceRule,
      start_time: startTime,
      frequency,
      start_date: startYmd,
      end_date: null,
      preferred_time: prefHhmm,
      location_type: locationType,
      location_id: b.location_id,
      payment_method: paymentMethod,
      is_active: true,
      last_booking_date: startYmd,
      metadata: {
        services,
        ...(addons.length > 0 ? { addons } : {}),
        address: addrPayload,
        booking_source: "online",
        pricing: {
          subtotal: Number(b.subtotal ?? 0) || 0,
          discount_amount: Number(b.discount_amount ?? 0) || 0,
          promotion_discount_amount: Number(b.promotion_discount_amount ?? 0) || 0,
          membership_discount_amount: Number(b.membership_discount_amount ?? 0) || 0,
          tax_amount: Number(b.tax_amount ?? 0) || 0,
          tax_rate: Number(b.tax_rate ?? 0) || 0,
          service_fee_percentage: Number(b.service_fee_percentage ?? 0) || 0,
          service_fee_amount: Number(b.service_fee_amount ?? 0) || 0,
          tip_amount: Number(b.tip_amount ?? 0) || 0,
          travel_fee: Number(b.travel_fee ?? 0) || 0,
          total_amount: Number(b.total_amount ?? 0) || 0,
        },
        source_booking_id: bookingId,
        recurring_payment_rule: paymentMethod === "cash" ? "provider_collect_each_visit" : "customer_pay_each_visit",
      },
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false as const, message: error.message || "Insert failed" };
  }

  const seriesId = (insertedSeries as { id?: string } | null)?.id;
  if (seriesId) {
    await admin.from("bookings").update({ recurring_series_id: seriesId }).eq("id", bookingId);
  }

  return { ok: true as const };
}
