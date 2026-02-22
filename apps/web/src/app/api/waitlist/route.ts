import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAuthInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const waitlistSchema = z.object({
  provider_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  staff_id: z.string().uuid().optional(),
  preferred_date: z.string().optional(),
  preferred_time_start: z.string().optional(),
  preferred_time_end: z.string().optional(),
  notes: z.string().optional(),
  customer_name: z.string().min(1, "Name is required"),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
});

/**
 * POST /api/waitlist
 * 
 * Join waitlist for a fully booked service
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const validated = waitlistSchema.parse(body);

    // Check if already on waitlist for same service/staff/date
    const existingQuery = supabase
      .from("waitlist_entries")
      .select("id")
      .eq("provider_id", validated.provider_id)
      .eq("customer_id", user.id)
      .eq("status", "waiting");

    if (validated.service_id) {
      existingQuery.eq("service_id", validated.service_id);
    }
    if (validated.staff_id) {
      existingQuery.eq("staff_id", validated.staff_id);
    }
    if (validated.preferred_date) {
      existingQuery.eq("preferred_date", validated.preferred_date);
    }

    const { data: existing } = await existingQuery.single();

    if (existing) {
      return errorResponse(
        "You are already on the waitlist for this service",
        "ALREADY_ON_WAITLIST",
        400
      );
    }

    // Create waitlist entry
    const { data: entry, error } = await supabase
      .from("waitlist_entries")
      .insert({
        provider_id: validated.provider_id,
        customer_id: user.id,
        customer_name: validated.customer_name,
        customer_email: validated.customer_email || user.email,
        customer_phone: validated.customer_phone,
        service_id: validated.service_id,
        staff_id: validated.staff_id,
        preferred_date: validated.preferred_date,
        preferred_time_start: validated.preferred_time_start,
        preferred_time_end: validated.preferred_time_end,
        notes: validated.notes,
        status: "waiting",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Notify provider
    try {
      const { data: provider } = await supabase
        .from("providers")
        .select("user_id, business_name")
        .eq("id", validated.provider_id)
        .single();

      if (provider?.user_id) {
        await supabase.from("notifications").insert({
          user_id: provider.user_id,
          type: "waitlist_entry",
          title: "New Waitlist Entry",
          message: `${validated.customer_name} joined the waitlist for your service.`,
          metadata: {
            waitlist_id: entry.id,
            customer_name: validated.customer_name,
          },
          link: `/provider/waitlist`,
        });
      }
    } catch (notifError) {
      console.warn("Failed to notify provider of waitlist entry:", notifError);
    }

    return successResponse({
      entry,
      message: "Added to waitlist successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to join waitlist");
  }
}

/**
 * GET /api/waitlist
 * 
 * Get user's waitlist entries
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer();

    const { data: entries, error } = await supabase
      .from("waitlist_entries")
      .select(`
        *,
        provider:providers!inner(
          id,
          business_name,
          slug
        ),
        service:offerings(
          id,
          title
        ),
        staff:provider_staff(
          id,
          name
        )
      `)
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse({ entries: entries || [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch waitlist entries");
  }
}
