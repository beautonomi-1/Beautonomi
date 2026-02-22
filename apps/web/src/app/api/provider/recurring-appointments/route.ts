import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkRecurringAppointmentFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const createRecurringSchema = z.object({
  customer_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  staff_id: z.string().uuid().optional(),
  recurrence_rule: z.string().min(1, "Recurrence rule is required"), // RRULE format
  start_date: z.string().date(), // DATE format
  end_date: z.string().date().optional(), // DATE format
  start_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, "Time must be in HH:MM:SS format"), // TIME format
  notes: z.string().optional(),
  is_active: z.boolean().optional().default(true),
});

/**
 * GET /api/provider/recurring-appointments
 * 
 * List provider's recurring appointments
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check subscription allows recurring appointments
    const recurringAccess = await checkRecurringAppointmentFeatureAccess(providerId);
    if (!recurringAccess.enabled) {
      return errorResponse(
        "Recurring appointments require a subscription upgrade. Please upgrade to Starter plan or higher.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    const { data: appointments, error, count } = await supabase
      .from("recurring_appointments")
      .select("*", { count: "exact" })
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return successResponse({
      data: appointments || [],
      total: count || 0,
      page,
      total_pages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch recurring appointments");
  }
}

/**
 * POST /api/provider/recurring-appointments
 * 
 * Create a new recurring appointment
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check subscription allows recurring appointments
    const recurringAccess = await checkRecurringAppointmentFeatureAccess(providerId);
    if (!recurringAccess.enabled) {
      return errorResponse(
        "Recurring appointments require a subscription upgrade. Please upgrade to Starter plan or higher.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    const body = await request.json();
    const validated = createRecurringSchema.parse(body);

    // Check if advanced patterns are required (custom RRULE patterns)
    // Simple patterns: DAILY, WEEKLY, MONTHLY
    // Advanced: Custom RRULE with complex rules
    const isAdvancedPattern = validated.recurrence_rule.includes("BY") || 
                               validated.recurrence_rule.includes("INTERVAL") ||
                               validated.recurrence_rule.includes("COUNT") ||
                               validated.recurrence_rule.includes("UNTIL");
    
    if (isAdvancedPattern && !recurringAccess.advancedPatterns) {
      return errorResponse(
        "Custom recurring patterns require a Professional plan or higher. Please upgrade to use advanced patterns.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    const { data: appointment, error } = await supabase
      .from("recurring_appointments")
      .insert({
        provider_id: providerId,
        ...validated,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(appointment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", 400);
    }
    return handleApiError(error, "Failed to create recurring appointment");
  }
}
