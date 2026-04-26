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
      "id, customer_id, provider_id, scheduled_at, location_type, location_id, address_line1, address_city, address_country, address_postal_code, address_latitude, address_longitude",
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
        address: addrPayload,
        source_booking_id: bookingId,
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
