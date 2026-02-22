import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/providers/[id]
 * 
 * Get detailed provider information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin']);

    const { id } = await params;
    const supabase = await getSupabaseServer();

    // Get provider with owner info
    const { data: provider, error } = await supabase
      .from("providers")
      .select(`
        *,
        owner:users!providers_user_id_fkey(id, full_name, email, phone, avatar_url),
        locations:provider_locations(*),
        staff:provider_staff(*),
        offerings:provider_offerings(*)
      `)
      .eq("id", id)
      .single();

    if (error || !provider) {
      return notFoundResponse("Provider not found");
    }

    // Get stats
    const { count: bookingCount } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("provider_id", id);

    const { count: reviewCount } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("provider_id", id);

    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating")
      .eq("provider_id", id);

    const avgRating =
      reviews && reviews.length > 0
        ? reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviews.length
        : 0;

    return successResponse({
      ...(provider as Record<string, unknown>),
      stats: {
        booking_count: bookingCount || 0,
        review_count: reviewCount || 0,
        average_rating: avgRating,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch provider");
  }
}

/**
 * PATCH /api/admin/providers/[id]
 * 
 * Update provider details
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin']);
    const { id } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();

    // Verify provider exists
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("id", id)
      .single();

    if (!provider) {
      return notFoundResponse("Provider not found");
    }

    // Prepare update data (only allow specific fields)
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.business_name !== undefined) updateData.business_name = body.business_name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.business_type !== undefined) updateData.business_type = body.business_type;

    // Update provider
    const { data: updatedProvider, error: updateError } = await supabase
      .from("providers")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        owner:users!providers_user_id_fkey(id, full_name, email, phone, avatar_url),
        locations:provider_locations(*),
        staff:provider_staff(*),
        offerings:provider_offerings(*)
      `)
      .single();

    if (updateError || !updatedProvider) {
      return handleApiError(updateError, "Failed to update provider");
    }

    return successResponse(updatedProvider);
  } catch (error) {
    return handleApiError(error, "Failed to update provider");
  }
}
