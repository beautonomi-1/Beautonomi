import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/group-bookings/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: groupBooking, error } = await supabase
      .from("group_bookings")
      .select(`
        *,
        bookings:bookings(
          id, booking_number, ref_number, status, scheduled_at, total_amount,
          customer:users!bookings_customer_id_fkey(id, full_name, email, phone, avatar_url)
        )
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !groupBooking) {
      return notFoundResponse("Group booking not found");
    }

    return successResponse(groupBooking);
  } catch (error) {
    return handleApiError(error, "Failed to fetch group booking");
  }
}

/**
 * PATCH /api/provider/group-bookings/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const { id } = await params;
    const body = await request.json();
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data, error } = await supabase
      .from("group_bookings")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error || !data) {
      return notFoundResponse("Group booking not found");
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update group booking");
  }
}

/**
 * DELETE /api/provider/group-bookings/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Cancel all associated bookings first
    await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("group_booking_id", id)
      .eq("provider_id", providerId);

    // Then cancel the group booking
    const { error } = await supabase
      .from("group_bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({ success: true, message: "Group booking cancelled" });
  } catch (error) {
    return handleApiError(error, "Failed to delete group booking");
  }
}
