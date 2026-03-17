import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAuthInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

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
  preferred_time: z.string(), // HH:MM format
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

    // Calculate end date if not provided
    let endDate: Date | null = null;
    if (validated.end_date) {
      endDate = new Date(validated.end_date);
    } else if (validated.number_of_occurrences) {
      const startDate = new Date(validated.start_date);
      const daysToAdd = validated.frequency === "weekly" 
        ? validated.number_of_occurrences * 7
        : validated.frequency === "biweekly"
        ? validated.number_of_occurrences * 14
        : validated.number_of_occurrences * 30;
      endDate = new Date(startDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    }

    // Create recurring appointment
    const { data: recurring, error } = await supabase
      .from("recurring_appointments")
      .insert({
        provider_id: validated.provider_id,
        customer_id: user.id,
        frequency: validated.frequency,
        start_date: validated.start_date,
        end_date: endDate?.toISOString().split("T")[0] || null,
        preferred_time: validated.preferred_time,
        location_type: validated.location_type,
        location_id: validated.location_id,
        payment_method: validated.payment_method,
        is_active: validated.is_active,
        metadata: {
          services: validated.services,
          address: validated.address,
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
      message: "Recurring booking created successfully",
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
 * Compute next occurrence date from start/last_booking + frequency.
 */
function computeNextDate(
  startDateStr: string | null,
  lastBookingDateStr: string | null,
  frequency: string | null
): string | null {
  const base = lastBookingDateStr || startDateStr;
  if (!base || !frequency) return startDateStr || null;
  const baseDate = new Date(base);
  const days =
    frequency === "weekly"
      ? 7
      : frequency === "biweekly"
        ? 14
        : frequency === "monthly"
          ? 30
          : 7;
  const next = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString().split("T")[0];
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
      const frequency = row.frequency ?? "weekly";
      const startDate = row.start_date ?? null;
      const lastBooking = row.last_booking_date ?? null;
      const endDate = row.end_date ?? null;
      const isActive = row.is_active !== false;
      const nextDate = computeNextDate(startDate, typeof lastBooking === "string" ? lastBooking : lastBooking ? new Date(lastBooking).toISOString().split("T")[0] : null, frequency);
      let status: "active" | "paused" | "cancelled" = "active";
      if (!isActive) status = endDate && endDate < todayStr ? "cancelled" : "paused";
      else if (endDate && endDate < todayStr) status = "cancelled";

      return {
        ...row,
        service_name: serviceName,
        provider_name: providerName,
        next_date: nextDate ?? startDate,
        status,
        price: row.price ?? null,
        currency: row.currency ?? "ZAR",
      };
    });

    return successResponse({ recurring: enriched });
  } catch (error) {
    return handleApiError(error, "Failed to fetch recurring bookings");
  }
}
