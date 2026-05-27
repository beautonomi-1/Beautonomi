import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const updateCategorySchema = z.object({
  name: z.string().min(1, "Category name is required").optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional()
    .nullable(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  display_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/categories/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data, error } = await supabase
      .from("provider_categories")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !data) return notFoundResponse("Category not found");
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch category");
  }
}

/**
 * PUT /api/provider/categories/[id]
 * Full replacement update — used by mobile catalogue edit sheet.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return _updateCategory(request, params);
}

/**
 * PATCH /api/provider/categories/[id]
 * Partial update — e.g. reorder only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return _updateCategory(request, params);
}

async function _updateCategory(
  request: NextRequest,
  paramsPromise: Promise<{ id: string }>
) {
  try {
    const { id } = await paramsPromise;
    const permissionCheck = await requirePermission("edit_services", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = await request.json();
    const parsed = updateCategorySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
      );
    }

    // If a new display_order is not provided but provider wants to reorder by direction,
    // support simple { direction: "up" | "down" } bodies too.
    let updates: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

    if ((body as any).direction === "up" || (body as any).direction === "down") {
      const { data: current } = await supabase
        .from("provider_categories")
        .select("display_order")
        .eq("id", id)
        .eq("provider_id", providerId)
        .single();

      if (current) {
        const step = (body as any).direction === "up" ? -1 : 1;
        const newOrder = Math.max(0, (current.display_order ?? 0) + step);

        // Swap with the neighbour that holds newOrder
        const { data: neighbour } = await supabase
          .from("provider_categories")
          .select("id, display_order")
          .eq("provider_id", providerId)
          .eq("display_order", newOrder)
          .neq("id", id)
          .maybeSingle();

        if (neighbour) {
          await supabase
            .from("provider_categories")
            .update({ display_order: current.display_order })
            .eq("id", neighbour.id);
        }

        updates = { display_order: newOrder, updated_at: new Date().toISOString() };
      }
    }

    const { data: category, error } = await supabase
      .from("provider_categories")
      .update(updates)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error || !category) return notFoundResponse("Category not found");
    return successResponse(category);
  } catch (error) {
    return handleApiError(error, "Failed to update category");
  }
}

/**
 * DELETE /api/provider/categories/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const permissionCheck = await requirePermission("edit_services", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    // Block delete when services are still assigned to this category
    const { data: linkedServices, error: linkedError } = await supabase
      .from("offerings")
      .select("id, title")
      .eq("provider_id", providerId)
      .eq("provider_category_id", id);

    if (linkedError) throw linkedError;

    if (linkedServices && linkedServices.length > 0) {
      return errorResponse(
        "Category has services assigned. Reassign or delete them first.",
        "CATEGORY_HAS_SERVICES",
        409,
        {
          services: linkedServices.map((s) => ({
            id: s.id,
            name: s.title,
          })),
        },
      );
    }

    const { error } = await supabase
      .from("provider_categories")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) throw error;
    return successResponse({ message: "Category deleted" });
  } catch (error) {
    return handleApiError(error, "Failed to delete category");
  }
}
