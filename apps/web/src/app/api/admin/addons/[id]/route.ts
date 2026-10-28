import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";
import {
  buildOfferingUpdateFromAddonBody,
  mapOfferingRowToAddonApi,
  OFFERING_ADDON_SELECT,
  type OfferingAddonRow,
} from "@/lib/offerings/addon-offering-api";

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

async function getAdminAddon(admin: ReturnType<typeof getSupabaseAdmin>, id: string) {
  const { data, error } = await admin
    .from("offerings")
    .select(OFFERING_ADDON_SELECT)
    .eq("id", id)
    .eq("service_type", "addon")
    .maybeSingle();
  if (error) throw error;
  return data as OfferingAddonRow | null;
}

/**
 * GET /api/admin/addons/[id]
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);

    const { id } = await params;
    const admin = getSupabaseAdmin();
    const addon = await getAdminAddon(admin, id);

    if (!addon) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Addon not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: mapOfferingRowToAddonApi(addon),
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
      { status: 500 },
    );
  }
}

/**
 * PUT /api/admin/addons/[id]
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user: authUser } = await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);

    const { id } = await params;
    const admin = getSupabaseAdmin();
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
        { status: 400 },
      );
    }

    const existing = await getAdminAddon(admin, id);
    if (!existing) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Addon not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 },
      );
    }

    const {
      service_ids,
      type: _type,
      max_quantity: _mq,
      requires_service: _rs,
      ...rest
    } = validationResult.data;

    const patch = buildOfferingUpdateFromAddonBody({ ...rest, service_ids });

    const { data: addon, error } = await admin
      .from("offerings")
      .update(patch)
      .eq("id", id)
      .eq("service_type", "addon")
      .select(OFFERING_ADDON_SELECT)
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
        { status: 500 },
      );
    }

    const mapped = mapOfferingRowToAddonApi(addon as OfferingAddonRow);
    await writeAuditLog({
      actor_user_id: authUser.id,
      actor_role: authUser.role ?? "superadmin",
      action: "admin.addon.update",
      entity_type: "service_addon",
      entity_id: id,
      metadata: { provider_id: mapped.provider_id, type: "service" },
    });

    return NextResponse.json({
      data: mapped,
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
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/addons/[id]
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user: authUser } = await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);

    const { id } = await params;
    const admin = getSupabaseAdmin();

    const existing = await getAdminAddon(admin, id);
    if (!existing) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Addon not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 },
      );
    }

    const { error } = await admin
      .from("offerings")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("service_type", "addon");

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
        { status: 500 },
      );
    }

    await writeAuditLog({
      actor_user_id: authUser.id,
      actor_role: authUser.role ?? "superadmin",
      action: "admin.addon.delete",
      entity_type: "service_addon",
      entity_id: id,
      metadata: { provider_id: existing.provider_id },
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
      { status: 500 },
    );
  }
}
