/**
 * GET /api/provider/terminal-orders/[id] — order detail
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { resolveIntegrationSetupUrl } from "@/lib/terminal/resolve-integration-setup-url";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getServiceClient();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const { data: provRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId = (provRow as { tenant_id?: string } | null)?.tenant_id ?? null;

    const flagEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.TERMINAL_ECOMMERCE,
      tenantId,
    );
    if (!flagEnabled) {
      return errorResponse("Terminal ordering is not available yet.", "FEATURE_DISABLED", 403);
    }

    const { data, error } = await supabaseAdmin
      .from("terminal_orders")
      .select(
        `*,
        terminal_products(id, name, vendor, model, image_url, requires_integration_setup, integration_vendor_slug),
        terminal_collection_locations(id, name, address)`,
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) return errorResponse("Failed to load order", "LOAD_ERROR", 500, error);
    if (!data) return errorResponse("Order not found", "NOT_FOUND", 404);

    const tp = (data as { terminal_products?: { vendor?: string; integration_vendor_slug?: string | null } })
      .terminal_products;
    const integration_setup_url = tp
      ? resolveIntegrationSetupUrl(tp, id)
      : null;

    return successResponse({ order: { ...data, integration_setup_url } });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal order");
  }
}
