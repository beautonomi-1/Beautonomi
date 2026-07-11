import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { isMissingRelationError, migrationRequiredResponse } from "@/lib/supabase/migration-required";

/**
 * POST /api/provider/staff/[id]/time-clock/clock-out
 * 
 * Clock out a staff member
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify staff belongs to provider
    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id, name")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!staff) {
      return notFoundResponse("Staff member not found");
    }

    // Find active time card
    const today = new Date().toISOString().split('T')[0];
    const { data: timeCard, error: findError } = await supabase
      .from("staff_time_cards")
      .select("id, clock_in_time")
      .eq("staff_id", id)
      .eq("date", today)
      .is("clock_out_time", null)
      .single();

    if (findError || !timeCard) {
      if (findError?.code === 'PGRST116') {
        return errorResponse("No active clock-in found", "NO_ACTIVE_CLOCK_IN", 400);
      }
      if (isMissingRelationError(findError)) {
        return migrationRequiredResponse("Staff time tracking");
      }
      throw findError;
    }

    // Update time card (total_hours will be auto-calculated by trigger)
    const clockOut = new Date();
    const { data: updatedCard, error: updateError } = await supabase
      .from("staff_time_cards")
      .update({
        clock_out_time: clockOut.toISOString(),
        // total_hours will be automatically calculated by database trigger
      })
      .eq("id", timeCard.id)
      .select()
      .single();

    if (updateError) {
      if (isMissingRelationError(updateError)) {
        return migrationRequiredResponse("Staff time tracking");
      }
      throw updateError;
    }

    return successResponse({
      id: updatedCard.id,
      staff_id: id,
      team_member_name: staff.name,
      date: today,
      clock_in_time: updatedCard.clock_in_time,
      clock_out_time: updatedCard.clock_out_time,
      total_hours: updatedCard.total_hours,
      status: "clocked_out",
    });
  } catch (error) {
    return handleApiError(error, "Failed to clock out");
  }
}
