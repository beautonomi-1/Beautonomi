import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

const updateAddonSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  type: z.enum(["service", "product", "upgrade"]).optional(),
  category: z.string().optional().nullable(),
  price: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  duration_minutes: z.number().int().min(0).optional().nullable(),
  is_active: z.boolean().optional(),
  is_recommended: z.boolean().optional(),
  image_url: z.string().url().optional().nullable(),
  max_quantity: z.number().int().min(1).optional().nullable(),
  requires_service: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  service_ids: z.array(z.string().uuid()).optional(),
});

/**
 * GET /api/admin/addons/[id]
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin", "provider_owner"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: "Server error", code: "SERVER_ERROR" } },
        { status: 500 }
      );
    }

    const { data: addon, error } = await supabase
      .from("service_addons")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !addon) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Addon not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Check access - providers can only access their own addons; superadmin can access any
    if (auth.user.role === "provider_owner" && (addon as any).provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", (addon as any).provider_id)
        .eq("user_id", auth.user.id)
        .single();

      if (!provider) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Access denied",
              code: "FORBIDDEN",
            },
          },
          { status: 403 }
        );
      }
    }

    // Load service associations
    const { data: associations } = await (supabase as any)
      .from("service_addon_associations")
      .select("service_id")
      .eq("addon_id", id);

    return NextResponse.json({
      data: {
        ...(addon as Record<string, unknown>),
        service_ids: associations?.map((a: any) => a.service_id) || [],
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch addon",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/addons/[id]
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin", "provider_owner"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: "Server error", code: "SERVER_ERROR" } },
        { status: 500 }
      );
    }
    const body = await request.json();

    const validationResult = updateAddonSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    // Check existing addon
    const { data: existing } = await supabase
      .from("service_addons")
      .select("*")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Addon not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Check access for provider_owner
    if (auth.user.role === "provider_owner" && (existing as any).provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", (existing as any).provider_id)
        .eq("user_id", auth.user.id)
        .single();

      if (!provider) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Access denied",
              code: "FORBIDDEN",
            },
          },
          { status: 403 }
        );
      }
    }

    const { service_ids, ...updateData } = validationResult.data;

    const { data: addon, error } = await (supabase
      .from("service_addons") as any)
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !addon) {
      console.error("Error updating addon:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update addon",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Update service associations if provided
    if (service_ids !== undefined) {
      // Delete existing associations
      await (supabase as any).from("service_addon_associations").delete().eq("addon_id", id);

      // Create new associations
      if (service_ids.length > 0) {
        const associations = service_ids.map((serviceId: string) => ({
          addon_id: id,
          service_id: serviceId,
          created_at: new Date().toISOString(),
        }));

        await (supabase as any).from("service_addon_associations").insert(associations);
      }
    }

    // Load updated service associations
    const { data: associations } = await (supabase as any)
      .from("service_addon_associations")
      .select("service_id")
      .eq("addon_id", id);

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.addon.update",
      entity_type: "service_addon",
      entity_id: id,
      metadata: { provider_id: (addon as any).provider_id || null, type: (addon as any).type },
    });

    return NextResponse.json({
      data: {
        ...(addon as Record<string, unknown>),
        service_ids: associations?.map((a: any) => a.service_id) || [],
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update addon",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/addons/[id]
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin", "provider_owner"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: "Server error", code: "SERVER_ERROR" } },
        { status: 500 }
      );
    }

    // Check existing addon
    const { data: existing } = await supabase
      .from("service_addons")
      .select("*")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Addon not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Check access - providers can only delete their own addons; superadmin can delete any
    if (auth.user.role === "provider_owner" && (existing as any).provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", (existing as any).provider_id)
        .eq("user_id", auth.user.id)
        .single();

      if (!provider) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Access denied",
              code: "FORBIDDEN",
            },
          },
          { status: 403 }
        );
      }
    }

    // Soft delete
    const { error } = await (supabase
      .from("service_addons") as any)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Error deleting addon:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete addon",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.addon.delete",
      entity_type: "service_addon",
      entity_id: id,
      metadata: { provider_id: (existing as any).provider_id || null },
    });

    return NextResponse.json({
      data: { id, deleted: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete addon",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
