import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/profile
 * Get provider profile information
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .select("id, business_name, description, business_type, phone, email")
      .eq("id", providerId)
      .single();

    if (error || !provider) {
      throw error || new Error("Provider not found");
    }

    return successResponse(provider);
  } catch (error) {
    return handleApiError(error, "Failed to fetch provider profile");
  }
}

/**
 * PATCH /api/provider/profile
 * Update provider profile information
 */
export async function PATCH(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    // Validate description length if provided
    if (body.description !== undefined) {
      if (body.description && body.description.length > 2000) {
        return handleApiError(
          new Error("Description must be 2000 characters or less"),
          "Validation failed",
          "VALIDATION_ERROR",
          400
        );
      }
    }

    const updates: any = {};
    if (body.description !== undefined) {
      updates.description = body.description || null;
    }
    if (body.business_name !== undefined) {
      updates.business_name = body.business_name;
    }
    if (body.phone !== undefined) {
      updates.phone = body.phone;
    }
    if (body.email !== undefined) {
      updates.email = body.email;
    }
    if (body.gallery !== undefined) {
      // Validate gallery is an array of strings
      if (Array.isArray(body.gallery)) {
        updates.gallery = body.gallery;
      } else {
        return handleApiError(
          new Error("Gallery must be an array of image URLs"),
          "Validation failed",
          "VALIDATION_ERROR",
          400
        );
      }
    }
    if (body.thumbnail_url !== undefined) {
      updates.thumbnail_url = body.thumbnail_url || null;
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .update(updates)
      .eq("id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(provider);
  } catch (error) {
    return handleApiError(error, "Failed to update provider profile");
  }
}
