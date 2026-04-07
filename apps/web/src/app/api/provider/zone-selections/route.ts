import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  badRequestResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

const zoneSelectionSchema = z.object({
  platform_zone_id: z.string().uuid(),
  travel_fee: z.number().min(0),
  currency: z.string().length(3).optional(),
  travel_time_minutes: z.number().int().positive().default(30),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
});

/**
 * GET /api/provider/zone-selections
 * Get all platform zones with provider's selection status
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    // Get all active platform zones
    const { data: platformZones, error: zonesError } = await supabase
      .from("platform_zones")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (zonesError) {
      throw zonesError;
    }

    const eligibleZones = (platformZones || []).filter((z: Record<string, unknown>) => {
      const status = z.status as string | undefined;
      if (status === "archived") return false;
      if (status === "active") return true;
      if (status === "draft") return false;
      return z.is_active === true;
    });

    // Get provider's zone selections
    const { data: selections, error: selectionsError } = await supabase
      .from("provider_zone_selections")
      .select("*")
      .eq("provider_id", providerId);

    if (selectionsError) {
      throw selectionsError;
    }

    // Map selections by platform_zone_id for quick lookup
    const selectionsMap = new Map(
      (selections || []).map((s) => [s.platform_zone_id, s])
    );

    const zonesWithSelections = eligibleZones.map((zone: Record<string, unknown>) => {
      const id = zone.id as string;
      const selection = selectionsMap.get(id);
      return {
        platform_zone: {
          id,
          name: (zone.name as string) ?? "Zone",
          region: (zone.country_code as string | null) ?? null,
          description: (zone.description as string | null) ?? null,
        },
        selection: selection || null,
        is_selected: !!selection,
      };
    });

    return successResponse(zonesWithSelections);
  } catch (error) {
    return handleApiError(error, "Failed to fetch zone selections");
  }
}

/**
 * POST /api/provider/zone-selections
 * Select a platform zone and set provider pricing
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

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

    const body = await request.json();
    const validationResult = zoneSelectionSchema.safeParse(body);

    if (!validationResult.success) {
      return badRequestResponse(
        validationResult.error.issues.map((i) => i.message).join(", ")
      );
    }

    const data = {
      ...validationResult.data,
      currency: validationResult.data.currency ?? lastResortCurrency,
    };

    const admin = getSupabaseAdmin();
    const { data: platformZone, error: zoneError } = await admin
      .from("platform_zones")
      .select("id, status, is_active")
      .eq("id", data.platform_zone_id)
      .maybeSingle();

    const row = platformZone as { id?: string; status?: string; is_active?: boolean } | null;
    const zoneOk =
      row &&
      (row.status === "active" ||
        (row.is_active === true && row.status !== "draft" && row.status !== "archived"));
    if (zoneError || !zoneOk) {
      return badRequestResponse("Platform zone not found or inactive");
    }

    // Check if already selected
    const { data: existing, error: _checkError } = await supabase
      .from("provider_zone_selections")
      .select("id")
      .eq("provider_id", providerId)
      .eq("platform_zone_id", data.platform_zone_id)
      .single();

    if (existing) {
      return badRequestResponse("Zone already selected. Use PATCH to update.");
    }

    // Create selection
    const { data: selection, error: insertError } = await supabase
      .from("provider_zone_selections")
      .insert({
        provider_id: providerId,
        platform_zone_id: data.platform_zone_id,
        travel_fee: data.travel_fee,
        currency: data.currency,
        travel_time_minutes: data.travel_time_minutes,
        description: data.description || null,
        is_active: data.is_active,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return successResponse(selection);
  } catch (error) {
    return handleApiError(error, "Failed to select zone");
  }
}
