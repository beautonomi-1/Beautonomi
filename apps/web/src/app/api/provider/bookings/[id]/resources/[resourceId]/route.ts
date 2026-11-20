import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { isBookingResourceLocked } from "@beautonomi/utils";

/**
 * DELETE /api/provider/bookings/[id]/resources/[resourceId]
 * Remove a resource assignment from this booking.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; resourceId: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const adminSupabase = getSupabaseAdmin();
    const { id: bookingId, resourceId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();
    if (!booking) return notFoundResponse("Booking not found");
    if (isBookingResourceLocked((booking as { status?: string }).status)) {
      return errorResponse("Cannot change resources on a closed booking.", "BOOKING_CLOSED", 409);
    }

    const { data: existing, error: findError } = await adminSupabase
      .from("booking_resources")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("resource_id", resourceId)
      .maybeSingle();

    if (findError) throw findError;
    if (!existing) return notFoundResponse("Resource assignment not found");

    const { error: delError } = await adminSupabase
      .from("booking_resources")
      .delete()
      .eq("booking_id", bookingId)
      .eq("resource_id", resourceId);

    if (delError) throw delError;

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to remove resource");
  }
}
