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

const addonSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  type: z.enum(["service", "product", "upgrade"]),
  category: z.string().optional().nullable(),
  price: z.number().min(0, "Price must be non-negative"),
  currency: z.string().length(3).default("ZAR"),
  duration_minutes: z.number().int().min(0).optional().nullable(),
  is_active: z.boolean().default(true),
  is_recommended: z.boolean().default(false),
  image_url: z.string().url().optional().nullable(),
  service_ids: z.array(z.string().uuid()).optional().default([]),
  max_quantity: z.number().int().min(1).optional().nullable(),
  requires_service: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

/**
 * GET /api/provider/addons
 * List addons for the provider's business (provider-scoped)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const isActive = searchParams.get("is_active");
    const locationId = searchParams.get("location_id");

    let query = supabase
      .from("service_addons")
      .select("*")
      .eq("provider_id", providerId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (type) {
      query = query.eq("type", type);
    }
    if (isActive !== null && isActive !== undefined && isActive !== "") {
      query = query.eq("is_active", isActive === "true");
    }

    const { data: addons, error } = await query;

    if (error) {
      throw error;
    }

    let filteredAddons = addons ?? [];

    // Branch filter: when location_id provided, only addons available at that location
    if (locationId && filteredAddons.length > 0) {
      const addonIds = filteredAddons.map((a: any) => a.id);
      const { data: addonLocs } = await supabase
        .from("addon_locations")
        .select("addon_id")
        .in("addon_id", addonIds)
        .eq("location_id", locationId);
      const addonIdsAtLocation = new Set((addonLocs ?? []).map((r: any) => r.addon_id));
      const { data: allAddonLocs } = await supabase
        .from("addon_locations")
        .select("addon_id")
        .in("addon_id", addonIds);
      const addonIdsWithAnyRestriction = new Set((allAddonLocs ?? []).map((r: any) => r.addon_id));
      filteredAddons = filteredAddons.filter((a: any) =>
        !addonIdsWithAnyRestriction.has(a.id) || addonIdsAtLocation.has(a.id)
      );
    }

    if (filteredAddons.length > 0) {
      const addonIds = filteredAddons.map((a: any) => a.id);
      const { data: associations } = await (supabase as any)
        .from("service_addon_associations")
        .select("addon_id, service_id")
        .in("addon_id", addonIds);

      const addonsWithServices = filteredAddons.map((addon: any) => ({
        ...addon,
        service_ids: associations?.filter((a: any) => a.addon_id === addon.id).map((a: any) => a.service_id) || [],
      }));

      return successResponse(addonsWithServices);
    }

    return successResponse(filteredAddons);
  } catch (error) {
    return handleApiError(error, "Failed to fetch addons");
  }
}

/**
 * POST /api/provider/addons
 * Create a new addon for the provider (provider-scoped)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }
    const body = await request.json();

    const validationResult = addonSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        validationResult.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { service_ids, ...addonData } = validationResult.data;

    const { data: addon, error } = await (supabase.from("service_addons") as any)
      .insert({
        ...addonData,
        provider_id: providerId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !addon) {
      throw error || new Error("Failed to create addon");
    }

    if (service_ids && service_ids.length > 0) {
      const associations = service_ids.map((serviceId: string) => ({
        addon_id: (addon as any).id,
        service_id: serviceId,
        created_at: new Date().toISOString(),
      }));
      await (supabase as any).from("service_addon_associations").insert(associations);
    }

    return successResponse({ ...(addon as Record<string, unknown>), service_ids: service_ids || [] });
  } catch (error) {
    return handleApiError(error, "Failed to create addon");
  }
}
