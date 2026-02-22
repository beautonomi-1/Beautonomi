import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const productCategorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  display_order: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

/**
 * GET /api/provider/product-categories
 * 
 * Get provider's product categories
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

    // Get provider's product categories
    const { data: categories, error } = await supabase
      .from("provider_product_categories")
      .select("*")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching product categories:", error);
      return handleApiError(error, "Failed to fetch product categories");
    }

    return successResponse(categories || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch product categories");
  }
}

/**
 * POST /api/provider/product-categories
 * 
 * Create a new provider product category
 */
export async function POST(request: NextRequest) {
  try {
    // Check permission to edit products
    const permissionCheck = await requirePermission('edit_products', request);
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
    const validationResult = productCategorySchema.safeParse(body);
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
        .from("provider_product_categories")
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
        .from("provider_product_categories")
        .select("display_order")
        .eq("provider_id", providerId)
        .order("display_order", { ascending: false })
        .limit(1)
        .single();
      finalDisplayOrder = maxOrder ? (maxOrder.display_order || 0) + 1 : 0;
    }

    const { data: category, error } = await supabase
      .from("provider_product_categories")
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
      throw error || new Error("Failed to create product category");
    }

    return successResponse(category);
  } catch (error) {
    return handleApiError(error, "Failed to create product category");
  }
}
