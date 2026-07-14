import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAuthInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { preferredTimeSchema } from "@/lib/recurring/preferred-time-schema";
import { z } from "zod";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { addMonths, addWeeks, format, parseISO } from "date-fns";
import { nextUpcomingOccurrenceYmd } from "@/lib/recurring/next-due-date";

function customerFrequencyToRrule(frequency: "weekly" | "biweekly" | "monthly"): string {
  if (frequency === "weekly") return "FREQ=WEEKLY;INTERVAL=1";
  if (frequency === "biweekly") return "FREQ=WEEKLY;INTERVAL=2";
  return "FREQ=MONTHLY;INTERVAL=1";
}

function preferredTimeToHhMmSs(preferred: string): string {
  const t = preferred.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return "10:00:00";
}

const recurringBookingSchema = z.object({
  provider_id: z.string().uuid(),
  services: z.array(z.object({
    offering_id: z.string().uuid(),
    staff_id: z.string().uuid().optional().nullable(),
  })).min(1),
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  start_date: z.string().date(),
  end_date: z.string().date().optional(),
  number_of_occurrences: z.number().int().positive().optional(),
  preferred_time: preferredTimeSchema,
  location_type: z.enum(["at_home", "at_salon"]),
  location_id: z.string().uuid().optional().nullable(),
  address: z.object({
    line1: z.string().min(1),
    city: z.string().min(1),
    country: z.string().min(1),
    postal_code: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }).optional().nullable(),
  payment_method: z.enum(["card", "cash"]).default("card"),
  is_active: z.boolean().default(true),
  pricing: z.object({
    subtotal: z.number().min(0).optional(),
    discount_amount: z.number().min(0).optional(),
    promotion_discount_amount: z.number().min(0).optional(),
    membership_discount_amount: z.number().min(0).optional(),
    tax_amount: z.number().min(0).optional(),
    tax_rate: z.number().min(0).optional(),
    service_fee_percentage: z.number().min(0).optional(),
    service_fee_amount: z.number().min(0).optional(),
    tip_amount: z.number().min(0).optional(),
    travel_fee: z.number().min(0).optional(),
    total_amount: z.number().min(0).optional(),
  }).optional(),
  /** When the customer already completed a booking for this occurrence (e.g. checkout), avoids duplicate cron booking. */
  last_booking_date: z.string().date().optional(),
});

/**
 * POST /api/recurring-bookings
 * 
 * Create a recurring booking subscription
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validated = recurringBookingSchema.parse(body);

    // End date: explicit, or last occurrence date from count (calendar-aware months/weeks).
    let endDateYmd: string | null = null;
    if (validated.end_date) {
      endDateYmd = validated.end_date;
    } else if (validated.number_of_occurrences && validated.number_of_occurrences > 0) {
      const start = parseISO(validated.start_date);
      const n = validated.number_of_occurrences;
      const lastOcc =
        validated.frequency === "weekly"
          ? addWeeks(start, n - 1)
          : validated.frequency === "biweekly"
            ? addWeeks(start, 2 * (n - 1))
            : addMonths(start, n - 1);
      endDateYmd = format(lastOcc, "yyyy-MM-dd");
    }

    const first = validated.services[0]!;
    const startTime = preferredTimeToHhMmSs(validated.preferred_time);
    const recurrenceRule = customerFrequencyToRrule(validated.frequency);

    // Create recurring appointment
    const { data: recurring, error } = await supabase
      .from("recurring_appointments")
      .insert({
        provider_id: validated.provider_id,
        customer_id: user.id,
        service_id: first.offering_id,
        staff_id: first.staff_id ?? null,
        recurrence_rule: recurrenceRule,
        start_time: startTime,
        frequency: validated.frequency,
        start_date: validated.start_date,
        end_date: endDateYmd,
        preferred_time: validated.preferred_time,
        location_type: validated.location_type,
        location_id: validated.location_id,
        payment_method: validated.payment_method,
        is_active: validated.is_active,
        last_booking_date: validated.last_booking_date ?? null,
        metadata: {
          services: validated.services,
          address: validated.address,
          ...(validated.pricing ? { pricing: validated.pricing } : {}),
        },
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Create initial booking
    // This would trigger the first booking creation
    // The system should have a cron job to create future bookings

    return successResponse({
      recurring,
      message:
        "Recurring schedule saved. The first appointment is created by the daily job on the start date (payment is still per visit unless you pay in the app).",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to create recurring booking");
  }
}

/**
 * GET /api/recurring-bookings
 *
 * Get user's recurring bookings. Enriched with service_name, provider_name,
 * next_date, status, and optional price/currency for app and web alignment.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const { data: rows, error } = await supabase
      .from("recurring_appointments")
      .select(`
        *,
        provider:providers!inner(
          id,
          business_name,
          slug
        )
      `)
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const recurring = rows || [];
    const todayStr = new Date().toISOString().split("T")[0];

    // Resolve service names from metadata.services[].offering_id
    const offeringIds = new Set<string>();
    for (const row of recurring) {
      const meta = row?.metadata as { services?: { offering_id?: string }[] } | null;
      const services = meta?.services;
      if (Array.isArray(services)) {
        for (const s of services) {
          if (s?.offering_id) offeringIds.add(s.offering_id);
        }
      }
    }
    let offeringsMap: Map<string, string> = new Map();
    if (offeringIds.size > 0) {
      const { data: offerings } = await supabase
        .from("offerings")
        .select("id, title")
        .in("id", [...offeringIds]);
      if (offerings) {
        offeringsMap = new Map(offerings.map((o: { id: string; title: string | null }) => [o.id, o.title || "Service"]));
      }
    }

    const enriched = recurring.map((row: any) => {
      const provider = row.provider;
      const providerName = provider?.business_name ?? "Provider";
      const meta = row.metadata as { services?: { offering_id?: string }[] } | null;
      const firstOfferingId = Array.isArray(meta?.services) && meta.services[0]?.offering_id ? meta.services[0].offering_id : null;
      const serviceName = firstOfferingId ? offeringsMap.get(firstOfferingId) ?? "Recurring appointment" : "Recurring appointment";
      const startDate = row.start_date ?? null;
      const lastBooking =
        typeof row.last_booking_date === "string"
          ? row.last_booking_date
          : row.last_booking_date
            ? format(new Date(row.last_booking_date), "yyyy-MM-dd")
            : null;
      const endDate = row.end_date ?? null;
      const isActive = row.is_active !== false;
      const nextDate =
        startDate &&
        nextUpcomingOccurrenceYmd(
          {
            start_date: startDate,
            last_booking_date: lastBooking,
            frequency: row.frequency,
            recurrence_rule: row.recurrence_rule,
            end_date: endDate,
          },
          todayStr
        );
      // Treat end_date on or before today as ended (matches DELETE cancel which sets end_date to today).
      let status: "active" | "paused" | "cancelled" = "active";
      if (!isActive) status = endDate && endDate <= todayStr ? "cancelled" : "paused";
      else if (endDate && endDate <= todayStr) status = "cancelled";

      return {
        ...row,
        service_name: serviceName,
        provider_name: providerName,
        next_date: nextDate ?? startDate,
        status,
        price: row.price ?? null,
        currency: row.currency ?? lastResortCurrency,
      };
    });

    return successResponse({ recurring: enriched });
  } catch (error) {
    return handleApiError(error, "Failed to fetch recurring bookings");
  }
}
