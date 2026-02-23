import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const updateServiceSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  category_id: z.string().uuid().optional(),
  subcategory_id: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  default_duration_minutes: z.number().int().min(1).optional(),
  default_buffer_minutes: z.number().int().min(0).optional(),
  allowed_location_types: z.array(z.enum(["at_home", "at_salon"])).optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/catalog/services/[id]
 * 
 * Get a single master service
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

    const { data: service, error } = await supabase
      .from("master_services")
      .select(`
        *,
        category:categories!master_services_category_id_fkey(id, name, slug)
      `)
      .eq("id", id)
      .single();

    if (error || !service) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Service not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        ...(service as Record<string, unknown>),
        category_name: (service as any).category?.name || null,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/catalog/services/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch service",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/catalog/services/[id]
 * 
 * Update a master service
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
    const validationResult = updateServiceSchema.safeParse(body);
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

    // If category_id is being updated, verify it exists
    if (validationResult.data.category_id) {
      const { data: category } = await supabase
        .from("categories")
        .select("id")
        .eq("id", validationResult.data.category_id)
        .single();

      if (!category) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Category not found",
              code: "CATEGORY_NOT_FOUND",
            },
          },
          { status: 404 }
        );
      }
    }

    // If slug is being updated, check for duplicates
    if (validationResult.data.slug) {
      const { data: existing } = await supabase
        .from("master_services")
        .select("id")
        .eq("slug", validationResult.data.slug)
        .neq("id", id)
        .single();

      if (existing) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Service with this slug already exists",
              code: "DUPLICATE_SLUG",
            },
          },
          { status: 409 }
        );
      }

      // Ensure slug is lowercase
      validationResult.data.slug = validationResult.data.slug.toLowerCase();
    }

    const { data: service, error } = await (supabase
      .from("master_services") as any)
      .update(validationResult.data)
      .eq("id", id)
      .select()
      .single();

    if (error || !service) {
      console.error("Error updating service:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update service",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.catalog.service.update",
      entity_type: "master_service",
      entity_id: id,
      metadata: validationResult.data,
    });

    return NextResponse.json({
      data: service,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/catalog/services/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update service",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/catalog/services/[id]
 * 
 * Delete a master service (soft delete)
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

    // Check if service has active provider offerings
    const { count } = await supabase
      .from("provider_offerings")
      .select("*", { count: "exact", head: true })
      .eq("master_service_id", id)
      .eq("is_active", true);

    if (count && count > 0) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Cannot delete service with ${count} active provider offering(s). Please deactivate offerings first.`,
            code: "HAS_ACTIVE_OFFERINGS",
          },
        },
        { status: 400 }
      );
    }

    // Soft delete by setting is_active to false
    const { data: service, error } = await (supabase
      .from("master_services") as any)
      .update({ is_active: false })
      .eq("id", id)
      .select()
      .single();

    if (error || !service) {
      console.error("Error deleting service:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete service",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.catalog.service.delete",
      entity_type: "master_service",
      entity_id: id,
      metadata: { soft_deleted: true },
    });

    return NextResponse.json({
      data: { id, deleted: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/catalog/services/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete service",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
