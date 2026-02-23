import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens").optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/catalog/categories/[id]
 * 
 * Get a single category
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    const { data: category, error } = await supabase
      .from("categories")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !category) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Category not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Get service count
    const { count } = await supabase
      .from("master_services")
      .select("*", { count: "exact", head: true })
      .eq("category_id", id)
      .eq("is_active", true);

    return NextResponse.json({
      data: {
        ...(category as Record<string, unknown>),
        service_count: count || 0,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/catalog/categories/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch category",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/catalog/categories/[id]
 * 
 * Update a category
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate request body
    const validationResult = updateCategorySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
          },
        },
        { status: 400 }
      );
    }

    // If slug is being updated, check for duplicates
    if (validationResult.data.slug) {
      const { data: existing } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", validationResult.data.slug)
        .neq("id", id)
        .single();

      if (existing) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Category with this slug already exists",
              code: "DUPLICATE_SLUG",
            },
          },
          { status: 409 }
        );
      }

      // Ensure slug is lowercase
      validationResult.data.slug = validationResult.data.slug.toLowerCase();
    }

    const { data: category, error } = await (supabase
      .from("categories") as any)
      .update(validationResult.data)
      .eq("id", id)
      .select()
      .single();

    if (error || !category) {
      console.error("Error updating category:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update category",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.catalog.category.update",
      entity_type: "category",
      entity_id: id,
      metadata: validationResult.data,
    });

    return NextResponse.json({
      data: category,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/catalog/categories/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update category",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/catalog/categories/[id]
 * 
 * Delete a category (soft delete)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    // Check if category has active services
    const { count } = await supabase
      .from("master_services")
      .select("*", { count: "exact", head: true })
      .eq("category_id", id)
      .eq("is_active", true);

    if (count && count > 0) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Cannot delete category with ${count} active service(s). Please deactivate services first.`,
            code: "HAS_ACTIVE_SERVICES",
          },
        },
        { status: 400 }
      );
    }

    // Soft delete by setting is_active to false
    const { data: category, error } = await (supabase
      .from("categories") as any)
      .update({ is_active: false })
      .eq("id", id)
      .select()
      .single();

    if (error || !category) {
      console.error("Error deleting category:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete category",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.catalog.category.delete",
      entity_type: "category",
      entity_id: id,
      metadata: { soft_deleted: true },
    });

    return NextResponse.json({
      data: { id, deleted: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/catalog/categories/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete category",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
