import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

const updateResourceSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  type: z.enum(["article", "guide", "video"]).optional(),
  url: z.string().url().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/content/resources/[id]
 * 
 * Get a single resource
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: resource, error } = await supabase
      .from("resources")
      .select("*")
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .single();

    if (error || !resource) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Resource not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: resource,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/resources/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch resource",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/content/resources/[id]
 * 
 * Update a resource
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    // Validate request body
    const validationResult = updateResourceSchema.safeParse(body);
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

    const { data: resource, error } = await supabase
      .from("resources")
      .update(validationResult.data)
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .select()
      .single();

    if (error || !resource) {
      console.error("Error updating resource:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update resource",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.content.resource.update",
      entity_type: "content_resource",
      entity_id: id,
      metadata: validationResult.data,
    });

    return NextResponse.json({
      data: resource,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/resources/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update resource",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/content/resources/[id]
 * 
 * Delete a resource (soft delete)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    // Soft delete by setting is_active to false
    const { data: resource, error } = await supabase
      .from("resources")
      .update({ is_active: false })
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .select()
      .single();

    if (error || !resource) {
      console.error("Error deleting resource:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete resource",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.content.resource.delete",
      entity_type: "content_resource",
      entity_id: id,
      metadata: { soft_deleted: true },
    });

    return NextResponse.json({
      data: { id, deleted: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/content/resources/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete resource",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
