import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
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
 * GET /api/provider/addons/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { id } = await params;

    const { data: addon, error } = await supabase
      .from("service_addons")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !addon) {
      return notFoundResponse("Addon not found");
    }

    const { data: associations } = await (supabase as any)
      .from("service_addon_associations")
      .select("service_id")
      .eq("addon_id", id);

    return successResponse({
      ...(addon as Record<string, unknown>),
      service_ids: associations?.map((a: any) => a.service_id) || [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch addon");
  }
}

/**
 * PUT /api/provider/addons/[id]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { id } = await params;
    const body = await request.json();

    const validationResult = updateAddonSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        validationResult.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }

    const { data: existing } = await supabase
      .from("service_addons")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existing) {
      return notFoundResponse("Addon not found");
    }

    const { service_ids, ...updateData } = validationResult.data;

    const { data: addon, error } = await (supabase.from("service_addons") as any)
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error || !addon) {
      throw error || new Error("Failed to update addon");
    }

    if (service_ids !== undefined) {
      await (supabase as any).from("service_addon_associations").delete().eq("addon_id", id);
      if (service_ids.length > 0) {
        const associations = service_ids.map((serviceId: string) => ({
          addon_id: id,
          service_id: serviceId,
          created_at: new Date().toISOString(),
        }));
        await (supabase as any).from("service_addon_associations").insert(associations);
      }
    }

    const { data: associations } = await (supabase as any)
      .from("service_addon_associations")
      .select("service_id")
      .eq("addon_id", id);

    return successResponse({
      ...(addon as Record<string, unknown>),
      service_ids: associations?.map((a: any) => a.service_id) || [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to update addon");
  }
}

/**
 * DELETE /api/provider/addons/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { id } = await params;

    const { data: existing } = await supabase
      .from("service_addons")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existing) {
      return notFoundResponse("Addon not found");
    }

    const { error } = await (supabase.from("service_addons") as any)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({ id, deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete addon");
  }
}
