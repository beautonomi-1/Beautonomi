import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkCalendarSyncFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const updateCalendarSyncSchema = z.object({
  calendar_name: z.string().optional(),
  sync_direction: z.enum(["app_to_calendar", "calendar_to_app", "bidirectional"]).optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * PATCH /api/provider/calendar/sync/[id]
 * 
 * Update a calendar sync
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

    // Check subscription allows calendar sync
    const calendarAccess = await checkCalendarSyncFeatureAccess(providerId);
    if (!calendarAccess.enabled) {
      return errorResponse(
        "Calendar sync requires a subscription upgrade. Please upgrade to Starter plan or higher.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    // Verify sync belongs to provider
    const { data: sync, error: fetchError } = await supabase
      .from("calendar_syncs")
      .select("id, provider_id, sync_direction")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !sync) {
      return notFoundResponse("Calendar sync not found");
    }

    const body = await request.json();
    const validated = updateCalendarSyncSchema.parse(body);

    // Check API access for bidirectional sync
    if (validated.sync_direction === "bidirectional" && !calendarAccess.apiAccess) {
      return errorResponse(
        "Bidirectional calendar sync requires an Enterprise plan. Please upgrade to access this feature.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    const { data: updated, error } = await supabase
      .from("calendar_syncs")
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
    return handleApiError(error, "Failed to update calendar sync");
  }
}

/**
 * DELETE /api/provider/calendar/sync/[id]
 * 
 * Delete a calendar sync
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
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify sync belongs to provider
    const { data: sync, error: fetchError } = await supabase
      .from("calendar_syncs")
      .select("id, provider_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !sync) {
      return notFoundResponse("Calendar sync not found");
    }

    const { error } = await supabase
      .from("calendar_syncs")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete calendar sync");
  }
}
