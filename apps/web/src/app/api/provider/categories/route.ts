import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const providerCategorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  display_order: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

const _updateProviderCategorySchema = providerCategorySchema.partial();

/**
 * GET /api/provider/categories
 * 
 * Get provider's categories (both global associations and own categories)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get provider's own categories
    const { data: ownCategories, error: ownError } = await supabase
      .from("provider_categories")
      .select("*")
      .eq("provider_id", providerId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (ownError) {
      console.error("Error fetching provider categories:", ownError);
    }

    // Get global categories this provider is associated with
    const { data: associations, error: assocError } = await supabase
      .from("provider_global_category_associations")
      .select(`
        global_category_id,
        global_service_categories (*)
      `)
      .eq("provider_id", providerId);

    if (assocError) {
      console.error("Error fetching global category associations:", assocError);
    }

    const globalCategories = (associations || [])
      .map((assoc: any) => assoc.global_service_categories)
      .filter(Boolean);

    return successResponse({
      own_categories: ownCategories || [],
      global_categories: globalCategories || [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch categories");
  }
}

/**
 * POST /api/provider/categories
 * 
 * Create a new provider category
 */
export async function POST(request: NextRequest) {
  try {
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
    const validationResult = providerCategorySchema.safeParse(body);
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

    const { name, slug, description, icon, color, display_order, is_active } = validationResult.data;

    // Generate slug from name if not provided
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    // Ensure slug is unique by appending a number if needed
    let uniqueSlug = finalSlug;
    let counter = 1;
    while (true) {
      const { data: existing } = await supabase
        .from("provider_categories")
        .select("id")
        .eq("provider_id", providerId)
        .eq("slug", uniqueSlug)
        .single();
      
      if (!existing) {
        break;
      }
      uniqueSlug = `${finalSlug}-${counter}`;
      counter++;
    }

    // Get next display_order if not provided
    let finalDisplayOrder = display_order;
    if (finalDisplayOrder === undefined || finalDisplayOrder === null) {
      const { data: maxOrder } = await supabase
        .from("provider_categories")
        .select("display_order")
        .eq("provider_id", providerId)
        .order("display_order", { ascending: false })
        .limit(1)
        .single();
      finalDisplayOrder = maxOrder ? (maxOrder.display_order || 0) + 1 : 0;
    }

    const { data: category, error } = await (supabase
      .from("provider_categories") as any)
      .insert({
        provider_id: providerId,
        name,
        slug: uniqueSlug.toLowerCase(),
        description: description || null,
        icon: icon || null,
        color: color || null,
        display_order: finalDisplayOrder,
        is_active,
      })
      .select()
      .single();

    if (error || !category) {
      throw error || new Error("Failed to create provider category");
    }

    return successResponse(category);
  } catch (error) {
    return handleApiError(error, "Failed to create provider category");
  }
}
