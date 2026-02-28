import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * DELETE /api/provider/bookings/[id]/resources/[resourceId]
 * Remove a resource assignment from this booking.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; resourceId: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const adminSupabase = getSupabaseAdmin();
    const { id: bookingId, resourceId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();
    if (!booking) return notFoundResponse("Booking not found");

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
