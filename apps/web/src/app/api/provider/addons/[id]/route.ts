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

async function getProviderAddon(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  providerId: string,
  id: string,
) {
  const { data, error } = await supabase
    .from("offerings")
    .select(OFFERING_ADDON_SELECT)
    .eq("id", id)
    .eq("provider_id", providerId)
    .eq("service_type", "addon")
    .maybeSingle();
  if (error) throw error;
  return data as OfferingAddonRow | null;
}

/**
 * GET /api/provider/addons/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { id } = await params;
    const addon = await getProviderAddon(supabase, providerId, id);
    if (!addon) {
      return notFoundResponse("Addon not found");
    }

    return successResponse(mapOfferingRowToAddonApi(addon));
  } catch (error) {
    return handleApiError(error, "Failed to fetch addon");
  }
}

/**
 * PUT /api/provider/addons/[id]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
        400,
      );
    }

    const existing = await getProviderAddon(supabase, providerId, id);
    if (!existing) {
      return notFoundResponse("Addon not found");
    }

    const {
      service_ids,
      type: _type,
      max_quantity: _mq,
      requires_service: _rs,
      ...rest
    } = validationResult.data;

    const patch = buildOfferingUpdateFromAddonBody({ ...rest, service_ids });

    const { data: addon, error } = await supabase
      .from("offerings")
      .update(patch)
      .eq("id", id)
      .eq("provider_id", providerId)
      .eq("service_type", "addon")
      .select(OFFERING_ADDON_SELECT)
      .single();

    if (error || !addon) {
      throw error || new Error("Failed to update addon");
    }

    return successResponse(mapOfferingRowToAddonApi(addon as OfferingAddonRow));
  } catch (error) {
    return handleApiError(error, "Failed to update addon");
  }
}

/**
 * DELETE /api/provider/addons/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { id } = await params;

    const existing = await getProviderAddon(supabase, providerId, id);
    if (!existing) {
      return notFoundResponse("Addon not found");
    }

    const { error } = await supabase
      .from("offerings")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("provider_id", providerId)
      .eq("service_type", "addon");

    if (error) {
      throw error;
    }

    return successResponse({ id, deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete addon");
  }
}
