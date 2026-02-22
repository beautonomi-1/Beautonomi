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
    const supabase = await getSupabaseServer();
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
 * GET /api/recurring-bookings
 * 
 * Get user's recurring bookings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer();

    const { data: recurring, error } = await supabase
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

    return successResponse({ recurring: recurring || [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch recurring bookings");
  }
}
