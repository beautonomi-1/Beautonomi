import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkRecurringAppointmentFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const updateRecurringSchema = z.object({
  recurrence_rule: z.string().min(1).optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
  notes: z.string().optional(),
  is_active: z.boolean().optional(),
});

/**
 * PATCH /api/provider/recurring-appointments/[id]
 * 
 * Update a recurring appointment
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;
    
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

    // Verify appointment belongs to provider
    const { data: appointment, error: fetchError } = await supabase
      .from("recurring_appointments")
      .select("id, provider_id, recurrence_rule")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !appointment) {
      return notFoundResponse("Recurring appointment not found");
    }

    const body = await request.json();
    const validated = updateRecurringSchema.parse(body);

    // Check if advanced patterns are required (if recurrence_rule is being updated)
    if (validated.recurrence_rule) {
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
    }

    const { data: updated, error } = await supabase
      .from("recurring_appointments")
      .update({
        ...validated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", 400);
    }
    return handleApiError(error, "Failed to update recurring appointment");
  }
}

/**
 * DELETE /api/provider/recurring-appointments/[id]
 * 
 * Delete a recurring appointment (single instance or entire series)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const deleteSeries = searchParams.get("series") === "true";
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify appointment belongs to provider
    const { data: appointment, error: fetchError } = await supabase
      .from("recurring_appointments")
      .select("id, provider_id, customer_id, service_id, recurrence_rule")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !appointment) {
      return notFoundResponse("Recurring appointment not found");
    }

    if (deleteSeries) {
      // Delete all appointments with same recurrence_rule and customer/service
      // For simplicity, delete all recurring appointments for this customer/service combination
      let deleteQuery = supabase
        .from("recurring_appointments")
        .delete()
        .eq("customer_id", appointment.customer_id)
        .eq("provider_id", providerId);
      
      if (appointment.service_id) {
        deleteQuery = deleteQuery.eq("service_id", appointment.service_id);
      } else {
        deleteQuery = deleteQuery.is("service_id", null);
      }
      
      const { error } = await deleteQuery;
      
      if (error) {
        throw error;
      }
    } else {
      // Delete single instance
      const { error } = await supabase
        .from("recurring_appointments")
        .delete()
        .eq("id", id)
        .eq("provider_id", providerId);
      
      if (error) {
        throw error;
      }
    }

    return successResponse({ deleted: true, deleted_series: deleteSeries });
  } catch (error) {
    return handleApiError(error, "Failed to delete recurring appointment");
  }
}
