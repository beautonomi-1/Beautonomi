import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";
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

type AddonRow = { provider_id?: string | null; type?: string; name?: string; title?: string; applicable_service_ids?: string[] };

/**
 * GET /api/admin/addons/[id]
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: authUser } = await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
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

    const addonRow = addon as AddonRow;
    if (authUser.role === "provider_owner" && addonRow.provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", addonRow.provider_id)
        .eq("user_id", authUser.id)
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

    const addonData = addon as AddonRow & Record<string, unknown>;
    return NextResponse.json({
      data: {
        ...addonData,
        name: addonData.name ?? addonData.title ?? "",
        service_ids: Array.isArray(addonData.applicable_service_ids) ? addonData.applicable_service_ids : [],
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
    const { user: authUser } = await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
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

    const existingRow = existing as AddonRow;
    if (authUser.role === "provider_owner" && existingRow.provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", existingRow.provider_id)
        .eq("user_id", authUser.id)
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

    const { data: addon, error } = await supabase
      .from("service_addons")
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
      await supabase.from("service_addon_associations").delete().eq("addon_id", id);

      if (service_ids.length > 0) {
        const associations = service_ids.map((serviceId: string) => ({
          addon_id: id,
          service_id: serviceId,
          created_at: new Date().toISOString(),
        }));

        await supabase.from("service_addon_associations").insert(associations);
      }
    }

    const { data: associations } = await supabase
      .from("service_addon_associations")
      .select("service_id")
      .eq("addon_id", id);

    const addonOut = addon as AddonRow;
    await writeAuditLog({
      actor_user_id: authUser.id,
      actor_role: authUser.role ?? "superadmin",
      action: "admin.addon.update",
      entity_type: "service_addon",
      entity_id: id,
      metadata: { provider_id: addonOut.provider_id ?? null, type: addonOut.type },
    });

    type AssocRow = { service_id: string };
    return NextResponse.json({
      data: {
        ...(addon as Record<string, unknown>),
        service_ids: (associations as AssocRow[] | null)?.map((a) => a.service_id) ?? [],
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
    const { user: authUser } = await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
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

    const existingDel = existing as AddonRow;
    if (authUser.role === "provider_owner" && existingDel.provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", existingDel.provider_id)
        .eq("user_id", authUser.id)
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

    const { error } = await supabase
      .from("service_addons")
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
      actor_user_id: authUser.id,
      actor_role: authUser.role ?? "superadmin",
      action: "admin.addon.delete",
      entity_type: "service_addon",
      entity_id: id,
      metadata: { provider_id: existingDel.provider_id ?? null },
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
