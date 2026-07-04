/**
 * GET /api/admin/providers/:id/terminal-integrations
 *
 * Superadmin view of all terminal integrations for a specific provider.
 * Used in the Provider Detail page and Commercial Operations drilldowns.
 * Credentials are never returned — only status and metadata.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const supabase = getSupabaseAdmin();
    const providerId = params.id;

    const { data: integrations, error } = await supabase
      .from("provider_terminal_integrations")
      .select(`
        id, vendor, status, credential_mode, environment, is_enabled,
        merchant_id, merchant_ref, business_name,
        connected_at, last_sync_at, last_error,
        metadata, created_at, updated_at
      `)
      .eq("provider_id", providerId)
      .order("vendor");

    if (error) return errorResponse("Failed to load integrations", "LOAD_ERROR", 500, error);

    // Load device count per vendor
    const { data: devices } = await supabase
      .from("provider_terminal_devices")
      .select("vendor, is_active")
      .eq("provider_id", providerId);

    const deviceCountByVendor: Record<string, number> = {};
    for (const d of devices ?? []) {
      if ((d as any).is_active) {
        deviceCountByVendor[(d as any).vendor] = (deviceCountByVendor[(d as any).vendor] ?? 0) + 1;
      }
    }

    const enriched = (integrations ?? []).map((i: any) => ({
      ...i,
      active_device_count: deviceCountByVendor[i.vendor] ?? 0,
      // Never leak credentials
      api_key: undefined,
      api_secret: undefined,
      oauth_access_token: undefined,
      oauth_refresh_token: undefined,
      webhook_secret: undefined,
    }));

    return successResponse({ integrations: enriched });
  } catch (error) {
    return handleApiError(error, "Failed to load provider terminal integrations");
  }
}
