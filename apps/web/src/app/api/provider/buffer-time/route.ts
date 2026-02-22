import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/buffer-time
 * 
 * Get provider's buffer time settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);
    
    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse({
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        cleanupTimeMinutes: 0,
      });
    }

    // Get provider's buffer time settings
    const { data: provider, error } = await supabase
      .from("providers")
      .select("booking_buffer_before, booking_buffer_after, cleanup_time_minutes")
      .eq("id", providerId)
      .single();

    if (error) {
      console.error("Error fetching buffer time:", error);
      return successResponse({
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        cleanupTimeMinutes: 0,
      });
    }

    return successResponse({
      bufferBeforeMinutes: provider?.booking_buffer_before || 0,
      bufferAfterMinutes: provider?.booking_buffer_after || 0,
      cleanupTimeMinutes: provider?.cleanup_time_minutes || 0,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch buffer time settings");
  }
}

/**
 * PUT /api/provider/buffer-time
 * 
 * Update provider's buffer time settings
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner'], request);
    const supabase = await getSupabaseServer(request);
    
    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider not found");
    }

    const body = await request.json();

    // Validate and update buffer time settings
    const { error } = await supabase
      .from("providers")
      .update({
        booking_buffer_before: body.bufferBeforeMinutes || 0,
        booking_buffer_after: body.bufferAfterMinutes || 0,
        cleanup_time_minutes: body.cleanupTimeMinutes || 0,
      })
      .eq("id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({
      message: "Buffer time settings updated successfully",
      bufferBeforeMinutes: body.bufferBeforeMinutes || 0,
      bufferAfterMinutes: body.bufferAfterMinutes || 0,
      cleanupTimeMinutes: body.cleanupTimeMinutes || 0,
    });
  } catch (error) {
    return handleApiError(error, "Failed to update buffer time settings");
  }
}
