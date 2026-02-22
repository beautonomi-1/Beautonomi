import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, badRequestResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/promotions/[id]
 * 
 * Get a specific promotion
 */
export async function GET(
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
      return badRequestResponse("Provider not found");
    }

    // Fetch promotion
    const { data: promotion, error } = await supabase
      .from("promotions")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !promotion) {
      return notFoundResponse("Promotion not found");
    }

    return successResponse(promotion);
  } catch (error) {
    return handleApiError(error, "Failed to fetch promotion");
  }
}

/**
 * PATCH /api/provider/promotions/[id]
 * 
 * Update a promotion
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    // Check promotion exists
    const { data: existing } = await supabase
      .from("promotions")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existing) {
      return notFoundResponse("Promotion not found");
    }

    // Update promotion
    const updateData: any = {};
    
    if (body.description !== undefined) updateData.description = body.description;
    if (body.min_booking_amount !== undefined) updateData.min_booking_amount = body.min_booking_amount;
    if (body.max_uses !== undefined) updateData.max_uses = body.max_uses;
    if (body.start_date !== undefined) updateData.start_date = body.start_date;
    if (body.end_date !== undefined) updateData.end_date = body.end_date;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    const { data: promotion, error } = await supabase
      .from("promotions")
      .update(updateData)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(promotion);
  } catch (error) {
    return handleApiError(error, "Failed to update promotion");
  }
}

/**
 * DELETE /api/provider/promotions/[id]
 * 
 * Delete a promotion
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    // Delete promotion
    const { error } = await supabase
      .from("promotions")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete promotion");
  }
}
