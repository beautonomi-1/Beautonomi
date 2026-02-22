import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/categories/global/[id]/associate
 * 
 * Provider opts-in to a global category
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify global category exists and is active
    const { data: globalCategory, error: categoryError } = await supabase
      .from("global_service_categories")
      .select("id")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (categoryError || !globalCategory) {
      return notFoundResponse("Global category not found or inactive");
    }

    // Check if already associated
    const { data: existing } = await supabase
      .from("provider_global_category_associations")
      .select("id")
      .eq("provider_id", providerId)
      .eq("global_category_id", id)
      .single();

    if (existing) {
      return errorResponse("Provider is already associated with this category", "ALREADY_ASSOCIATED", 409);
    }

    // Create association
    const { data: association, error } = await (supabase
      .from("provider_global_category_associations") as any)
      .insert({
        provider_id: providerId,
        global_category_id: id,
      })
      .select()
      .single();

    if (error || !association) {
      throw error || new Error("Failed to associate with category");
    }

    return successResponse(association);
  } catch (error) {
    return handleApiError(error, "Failed to associate with category");
  }
}

/**
 * DELETE /api/provider/categories/global/[id]/associate
 * 
 * Provider opts-out of a global category
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Delete association
    const { error } = await supabase
      .from("provider_global_category_associations")
      .delete()
      .eq("provider_id", providerId)
      .eq("global_category_id", id);

    if (error) {
      throw error;
    }

    return successResponse({ message: "Association removed successfully" });
  } catch (error) {
    return handleApiError(error, "Failed to remove association");
  }
}
