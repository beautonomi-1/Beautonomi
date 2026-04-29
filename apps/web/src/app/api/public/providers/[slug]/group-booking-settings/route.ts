import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse } from "@/lib/supabase/api-helpers";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";
import { fetchGroupBookingPolicyFieldsFromDb } from "@/lib/public-booking/group-booking-policy-db";

/**
 * GET /api/public/providers/[slug]/group-booking-settings
 *
 * Get group booking settings for a provider (public endpoint for client booking)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) return tenantRes;
    const { tenantId } = tenantRes;

    const rawSlug = (await params).slug;
    let decodedSlug: string;
    try { decodedSlug = decodeURIComponent(rawSlug); } catch { decodedSlug = rawSlug; }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decodedSlug);

    // Use admin client to bypass RLS — consistent with the SSR profile loader
    const supabase = getSupabaseAdmin();

    let provider: { id: string } | null = null;

    const { data: providerData1 } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq(isUuid ? "id" : "slug", decodedSlug)
      .maybeSingle();

    if (providerData1) {
      provider = providerData1;
    } else if (!isUuid) {
      // Fallback: try original (non-decoded) slug
      const { data: providerData2 } = await supabase
        .from("providers")
        .select("id")
        .eq("slug", rawSlug)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (providerData2) {
        provider = providerData2;
      }
    }

    // If provider not found, return default values (don't return 404)
    if (!provider || !provider.id) {
      return successResponse({
        enabled: false,
        maxGroupSize: 10,
        excludedServices: [],
        enabledLocations: [],
      });
    }

    const fields = await fetchGroupBookingPolicyFieldsFromDb(supabase, provider.id);

    return successResponse({
      enabled: fields.onlineGroupBookingEnabled,
      maxGroupSize: fields.maxGroupSize,
      excludedServices: fields.excludedServiceIds,
      enabledLocations: fields.enabledLocationIds ?? [],
    });
  } catch (error) {
    // Return default values on error instead of error response
    console.error("[Group Booking Settings] Error:", error);
    return successResponse({
      enabled: false,
      maxGroupSize: 10,
      excludedServices: [],
      enabledLocations: [],
    });
  }
}
