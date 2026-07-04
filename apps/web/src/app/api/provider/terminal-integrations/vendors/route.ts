/**
 * GET /api/provider/terminal-integrations/vendors
 *
 * Returns the list of terminal vendors available to this provider.
 * A vendor is available when:
 *   1. terminal_integrations_enabled flag is ON for the tenant
 *   2. The vendor's own feature flag is ON (or the vendor has no dedicated flag)
 *   3. terminal_vendor_configs.enabled = true for this vendor
 *
 * Used by the provider terminal integrations hub to determine which vendors
 * to show, which are available to connect, and which are coming soon.
 *
 * Also returns the provider's current integration status for each vendor
 * so the hub can show connected / not connected state.
 */

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { isTerminalIntegrationsEnabled, getVendorFlagKey } from "@/lib/payments/terminal-integration-feature-gate";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    // Check hub master flag
    const hubEnabled = await isTerminalIntegrationsEnabled(supabaseAdmin, providerId);
    if (!hubEnabled) {
      return successResponse({ vendors: [], hub_enabled: false });
    }

    // Fetch tenant id
    const { data: provRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId = (provRow as { tenant_id?: string } | null)?.tenant_id ?? null;

    // Load all global vendor configs (plus tenant overrides if any)
    const { data: vendorConfigs, error: vcErr } = await supabaseAdmin
      .from("terminal_vendor_configs")
      .select("vendor, display_name, description, logo_url, help_url, credential_modes, requires_merchant_id, setup_instructions_text, feature_flag_key, enabled, api_docs_url")
      .is("tenant_id", null)  // global configs
      .order("display_name");

    if (vcErr) return errorResponse("Failed to load vendor configs", "LOAD_ERROR", 500, vcErr);

    // Load this provider's existing integrations
    const { data: integrations } = await supabaseAdmin
      .from("provider_terminal_integrations")
      .select("vendor, status, credential_mode, is_enabled, connected_at, merchant_id, business_name")
      .eq("provider_id", providerId);

    const integrationMap = new Map(
      (integrations ?? []).map((i: any) => [i.vendor, i])
    );

    // For each vendor, check per-vendor feature flag + vendor config enabled
    const vendorResults = await Promise.all(
      (vendorConfigs ?? []).map(async (vc: any) => {
        // Check per-vendor feature flag
        const flagKey = vc.feature_flag_key ?? getVendorFlagKey(vc.vendor);
        const flagEnabled = flagKey
          ? await isFeatureEnabledServer(flagKey, tenantId)
          : true;

        // Vendor is "available" only when both flag and config are enabled
        const available = vc.enabled && flagEnabled;

        const integration = integrationMap.get(vc.vendor) ?? null;

        return {
          vendor: vc.vendor,
          display_name: vc.display_name,
          description: vc.description,
          logo_url: vc.logo_url,
          help_url: vc.help_url,
          credential_modes: vc.credential_modes,
          requires_merchant_id: vc.requires_merchant_id,
          setup_instructions_text: vc.setup_instructions_text,
          api_docs_url: vc.api_docs_url,
          // Availability
          available,
          config_enabled: vc.enabled,
          flag_enabled: flagEnabled,
          // Current integration state
          connected: integration?.status === "connected",
          status: integration?.status ?? "not_connected",
          credential_mode: integration?.credential_mode ?? "none",
          is_enabled: integration?.is_enabled ?? false,
          connected_at: integration?.connected_at ?? null,
          merchant_id: integration?.merchant_id ?? null,
          business_name: integration?.business_name ?? null,
        };
      })
    );

    return successResponse({
      hub_enabled: true,
      vendors: vendorResults,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal vendors");
  }
}
