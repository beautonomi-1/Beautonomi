import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { checkRecurringAppointmentFeatureAccess } from "@/lib/subscriptions/feature-access";
import {
  ADVANCED_RECURRENCE_UPGRADE,
  SUBSCRIPTION_UPGRADE_SHORT,
} from "@/lib/subscriptions/subscription-upgrade-copy";
import { isAdvancedRecurrenceRule } from "@/lib/recurring/advanced-rrule";
import { z } from "zod";

const updateRecurringSchema = z.object({
  recurrence_rule: z.string().min(1).optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional().nullable(),
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .transform((v) => (v.length === 5 ? `${v}:00` : v))
    .optional(),
  notes: z.string().optional(),
  is_active: z.boolean().optional(),
  location_id: z.string().uuid().nullable().optional(),
  frequency: z.string().min(1).optional().nullable(),
  preferred_time: z.string().optional().nullable(),
  occurrences: z.number().int().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check subscription allows recurring appointments
    const recurringAccess = await checkRecurringAppointmentFeatureAccess(providerId, supabase);
    if (!recurringAccess.enabled) {
      return errorResponse(
        SUBSCRIPTION_UPGRADE_SHORT,
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
      const isAdvancedPattern = isAdvancedRecurrenceRule(validated.recurrence_rule);

      if (isAdvancedPattern && !recurringAccess.advancedPatterns) {
        return errorResponse(
          ADVANCED_RECURRENCE_UPGRADE,
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
    const permissionCheck = await requirePermission("delete_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const deleteSeries = searchParams.get("series") === "true";
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const recurringAccessDelete = await checkRecurringAppointmentFeatureAccess(providerId, supabase);
    if (!recurringAccessDelete.enabled) {
      return errorResponse(
        SUBSCRIPTION_UPGRADE_SHORT,
        "SUBSCRIPTION_REQUIRED",
        403
      );
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

    if (!deleteSeries) {
      return errorResponse(
        "Recurring appointments are managed as series. Delete the series, or cancel a generated booking from the calendar.",
        "UNSUPPORTED_INSTANCE_ACTION",
        400
      );
    }

    const { error } = await supabase
      .from("recurring_appointments")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({ deleted: true, deleted_series: deleteSeries });
  } catch (error) {
    return handleApiError(error, "Failed to delete recurring appointment");
  }
}
