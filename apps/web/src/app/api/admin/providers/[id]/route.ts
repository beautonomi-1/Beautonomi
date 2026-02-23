import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/providers/[id]
 * 
 * Get detailed provider information (superadmin only). Uses admin client to bypass RLS.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin'], request);

    const { id } = await params;
    const supabase = getSupabaseAdmin();

    // Get provider (avoid FK-hint join which can fail; fetch owner separately)
    const { data: provider, error } = await supabase
      .from("providers")
      .select(`
        *,
        locations:provider_locations(*),
        staff:provider_staff(*),
        offerings:provider_offerings(*)
      `)
      .eq("id", id)
      .single();

    if (error || !provider) {
      return notFoundResponse("Provider not found");
    }

    const prov = provider as Record<string, unknown> & { user_id?: string };
    let owner: { id: string; full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null } | null = null;
    if (prov.user_id) {
      const { data: ownerRow } = await supabase
        .from("users")
        .select("id, full_name, email, phone, avatar_url")
        .eq("id", prov.user_id)
        .single();
      owner = ownerRow as typeof owner;
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
      owner: owner ?? null,
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
    await requireRoleInApi(['superadmin'], request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
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

    const { data: updatedProvider, error: updateError } = await supabase
      .from("providers")
      .update(updateData)
      .eq("id", id)
      .select("*, locations:provider_locations(*), staff:provider_staff(*), offerings:provider_offerings(*)")
      .single();

    if (updateError || !updatedProvider) {
      return handleApiError(updateError, "Failed to update provider");
    }

    const updated = updatedProvider as Record<string, unknown> & { user_id?: string };
    let owner: { id: string; full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null } | null = null;
    if (updated.user_id) {
      const { data: ownerRow } = await supabase
        .from("users")
        .select("id, full_name, email, phone, avatar_url")
        .eq("id", updated.user_id)
        .single();
      owner = ownerRow as typeof owner;
    }
    return successResponse({ ...updated, owner: owner ?? null });
  } catch (error) {
    return handleApiError(error, "Failed to update provider");
  }
}
