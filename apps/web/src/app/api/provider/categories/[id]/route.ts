import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const updateProviderCategorySchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  display_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/categories/[id]
 * 
 * Get single provider category
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: category, error } = await supabase
      .from("provider_categories")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !category) {
      return notFoundResponse("Category not found");
    }

    return successResponse(category);
  } catch (error) {
    return handleApiError(error, "Failed to fetch category");
  }
}

/**
 * PUT /api/provider/categories/[id]
 * 
 * Update provider category
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Check permission to edit services (categories are part of services)
    const permissionCheck = await requirePermission('edit_services', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json();

    // Validate request body
    const validationResult = updateProviderCategorySchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }))
      );
    }

    const updateData: any = {};
    if (validationResult.data.name !== undefined) updateData.name = validationResult.data.name;
    if (validationResult.data.slug !== undefined)
      updateData.slug = validationResult.data.slug.toLowerCase();
    if (validationResult.data.description !== undefined)
      updateData.description = validationResult.data.description;
    if (validationResult.data.icon !== undefined) updateData.icon = validationResult.data.icon;
    if (validationResult.data.color !== undefined) updateData.color = validationResult.data.color;
    if (validationResult.data.display_order !== undefined)
      updateData.display_order = validationResult.data.display_order;
    if (validationResult.data.is_active !== undefined)
      updateData.is_active = validationResult.data.is_active;

    updateData.updated_at = new Date().toISOString();

    const { data: category, error } = await (supabase
      .from("provider_categories") as any)
      .update(updateData)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error || !category) {
      throw error || new Error("Failed to update provider category");
    }

    return successResponse(category);
  } catch (error) {
    return handleApiError(error, "Failed to update provider category");
  }
}

/**
 * DELETE /api/provider/categories/[id]
 * 
 * Delete provider category (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Check permission to edit services (categories are part of services)
    const permissionCheck = await requirePermission('edit_services', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: category, error } = await (supabase
      .from("provider_categories") as any)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error || !category) {
      throw error || new Error("Failed to delete provider category");
    }

    return successResponse({ message: "Provider category deleted successfully" });
  } catch (error) {
    return handleApiError(error, "Failed to delete provider category");
  }
}
