import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection,
  successResponse,
  handleApiError,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET/PATCH /api/admin/providers/[id]/distance-settings
 * Get/update distance settings for a provider (superadmin only). Uses admin client to bypass RLS.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const { data: provider, error } = await supabase
      .from("providers")
      .select("id, business_name, max_service_distance_km, is_distance_filter_enabled")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    if (!provider) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const result = {
      provider_id: provider.id,
      provider_name: provider.business_name,
      max_service_distance_km: provider.max_service_distance_km || 10.00,
      is_distance_filter_enabled: provider.is_distance_filter_enabled || false,
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load distance settings");
  }
}

/**
 * PATCH /api/admin/providers/[id]/distance-settings
 * Update distance settings for a provider (superadmin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};

    if (body.max_service_distance_km !== undefined) {
      const distance = parseFloat(body.max_service_distance_km);
      if (isNaN(distance) || distance < 1 || distance > 100) {
        return handleApiError(
          new Error("Invalid distance"),
          "Distance must be between 1 and 100 km",
          "VALIDATION_ERROR",
          400
        );
      }
      updates.max_service_distance_km = distance;
    }

    if (body.is_distance_filter_enabled !== undefined) {
      updates.is_distance_filter_enabled = Boolean(body.is_distance_filter_enabled);
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("id, business_name, max_service_distance_km, is_distance_filter_enabled")
      .single();

    if (error) {
      throw error;
    }

    const result = {
      provider_id: provider.id,
      provider_name: provider.business_name,
      max_service_distance_km: provider.max_service_distance_km || 10.00,
      is_distance_filter_enabled: provider.is_distance_filter_enabled || false,
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to update distance settings");
  }
}
