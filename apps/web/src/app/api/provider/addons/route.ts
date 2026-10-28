import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

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
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import {
  buildOfferingInsertFromAddonBody,
  filterAddonsByLocation,
  mapOfferingRowToAddonApi,
  OFFERING_ADDON_SELECT,
  shouldReturnEmptyForAddonTypeFilter,
  type OfferingAddonRow,
} from "@/lib/offerings/addon-offering-api";

const addonSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  type: z.enum(["service", "product", "upgrade"]),
  category: z.string().optional().nullable(),
  price: z.number().min(0, "Price must be non-negative"),
  currency: z.string().length(3).optional(),
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

    if (shouldReturnEmptyForAddonTypeFilter(type)) {
      return successResponse([]);
    }

    let query = supabase
      .from("offerings")
      .select(OFFERING_ADDON_SELECT)
      .eq("provider_id", providerId)
      .eq("service_type", "addon")
      .order("display_order", { ascending: true })
      .order("title", { ascending: true });

    if (isActive !== null && isActive !== undefined && isActive !== "") {
      query = query.eq("is_active", isActive === "true");
    } else {
      query = query.eq("is_active", true);
    }

    const { data: addons, error } = await query;

    if (error) {
      throw error;
    }

    let filteredAddons = (addons ?? []) as OfferingAddonRow[];

    if (locationId && filteredAddons.length > 0) {
      const addonIds = filteredAddons.map((a) => a.id);
      const { data: addonLocs } = await supabase
        .from("addon_locations")
        .select("addon_id")
        .in("addon_id", addonIds)
        .eq("location_id", locationId);
      const { data: allAddonLocs } = await supabase
        .from("addon_locations")
        .select("addon_id")
        .in("addon_id", addonIds);
      filteredAddons = filterAddonsByLocation(
        filteredAddons,
        locationId,
        addonLocs,
        allAddonLocs,
      );
    }

    return successResponse(filteredAddons.map(mapOfferingRowToAddonApi));
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
        validationResult.error.issues,
      );
    }

    const { service_ids, type: _type, max_quantity: _mq, requires_service: _rs, ...rest } =
      validationResult.data;
    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const lastResortCurrency =
      (await getTenantRegionConfig(effectiveTenantId))?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const insertRow = buildOfferingInsertFromAddonBody(
      providerId,
      { ...rest, service_ids },
      lastResortCurrency,
    );

    const { data: addon, error } = await supabase
      .from("offerings")
      .insert(insertRow)
      .select(OFFERING_ADDON_SELECT)
      .single();

    if (error || !addon) {
      throw error || new Error("Failed to create addon");
    }

    return successResponse(mapOfferingRowToAddonApi(addon as OfferingAddonRow));
  } catch (error) {
    return handleApiError(error, "Failed to create addon");
  }
}
