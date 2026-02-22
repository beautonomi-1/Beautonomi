import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateGlobalCategorySchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  display_order: z.number().int().min(0).optional(),
  is_featured: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/catalog/global-categories/[id]
 * 
 * Get single global category
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    await requireRoleInApi(['superadmin']);

    const supabase = await getSupabaseServer();

    const { data: category, error } = await supabase
      .from("global_service_categories")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !category) {
      return notFoundResponse("Global category not found");
    }

    // Get provider count
    const { count } = await supabase
      .from("provider_global_category_associations")
      .select("*", { count: "exact", head: true })
      .eq("global_category_id", id);

    return successResponse({
      ...(category as Record<string, unknown>),
      provider_count: count || 0,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch global category");
  }
}

/**
 * PUT /api/admin/catalog/global-categories/[id]
 * 
 * Update global category
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    await requireRoleInApi(['superadmin']);

    const supabase = await getSupabaseServer();
    const body = await request.json();

    // Validate request body
    const validated = updateGlobalCategorySchema.parse(body);

    const updateData: any = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.slug !== undefined)
      updateData.slug = validated.slug.toLowerCase();
    if (validated.description !== undefined)
      updateData.description = validated.description;
    if (validated.icon !== undefined) updateData.icon = validated.icon;
    if (validated.display_order !== undefined)
      updateData.display_order = validated.display_order;
    if (validated.is_featured !== undefined)
      updateData.is_featured = validated.is_featured;
    if (validated.is_active !== undefined)
      updateData.is_active = validated.is_active;

    updateData.updated_at = new Date().toISOString();

    const { data: category, error } = await (supabase
      .from("global_service_categories") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!category) {
      return notFoundResponse("Global category not found");
    }

    return successResponse(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Validation failed", 400);
    }
    return handleApiError(error, "Failed to update global category");
  }
}

/**
 * DELETE /api/admin/catalog/global-categories/[id]
 * 
 * Delete global category (soft delete by setting is_active to false)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    await requireRoleInApi(['superadmin']);

    const supabase = await getSupabaseServer();

    const { data: category, error } = await (supabase
      .from("global_service_categories") as any)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!category) {
      return notFoundResponse("Global category not found");
    }

    return successResponse({ message: "Global category deleted successfully" });
  } catch (error) {
    return handleApiError(error, "Failed to delete global category");
  }
}
