import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const globalCategorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  display_order: z.number().int().min(0).optional().default(0),
  is_featured: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
});

// Reserved for PATCH validation
const _updateGlobalCategorySchema = globalCategorySchema.partial();
void _updateGlobalCategorySchema;

/**
 * GET /api/admin/catalog/global-categories
 * 
 * Get all global categories
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);

    const supabase = await getSupabaseServer(request);

    const { data: categories, error } = await supabase
      .from("global_service_categories")
      .select("*")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    // Get provider count for each category
    const categoriesWithCounts = await Promise.all(
      (categories || []).map(async (category: any) => {
        try {
          const { count } = await supabase
            .from("provider_global_category_associations")
            .select("*", { count: "exact", head: true })
            .eq("global_category_id", category.id);

          return {
            ...category,
            provider_count: count || 0,
          };
        } catch {
          // If provider count fails, just return category without count
          return {
            ...category,
            provider_count: 0,
          };
        }
      })
    );

    return successResponse(categoriesWithCounts);
  } catch (error) {
    return handleApiError(error, "Failed to fetch global categories");
  }
}

/**
 * POST /api/admin/catalog/global-categories
 * 
 * Create a new global category
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);

    const supabase = await getSupabaseServer(request);
    let body;
    try {
      body = await request.json();
    } catch {
      return handleApiError(new Error("Invalid JSON in request body"), "Invalid request", 400);
    }

    // Validate request body
    let validated;
    try {
      validated = globalCategorySchema.parse(body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errorMessages = err.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
        return handleApiError(new Error(errorMessages), "Validation failed", 400);
      }
      throw err;
    }

    const { name, slug, description, icon, display_order, is_featured, is_active } = validated;

    // Normalize slug
    const normalizedSlug = slug.toLowerCase().trim();

    // Check if slug already exists
    const { data: existing, error: checkError } = await supabase
      .from("global_service_categories")
      .select("id")
      .eq("slug", normalizedSlug)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found" which is fine
      throw checkError;
    }

    if (existing) {
      return handleApiError(new Error("Category with this slug already exists"), "Duplicate slug", 409);
    }

    const { data: category, error } = await (supabase
      .from("global_service_categories") as any)
      .insert({
        name,
        slug: normalizedSlug,
        description: description || null,
        icon: icon || null,
        display_order: display_order ?? 0,
        is_featured: is_featured ?? false,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      return handleApiError(new Error(errorMessages), "Validation failed", 400);
    }
    console.error("Error creating global category:", error);
    return handleApiError(error, "Failed to create global category");
  }
}
