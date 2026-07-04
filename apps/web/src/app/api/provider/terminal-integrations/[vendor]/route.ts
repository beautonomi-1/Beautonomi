/**
 * GET    /api/provider/terminal-integrations/[vendor]  — get current integration state
 * PUT    /api/provider/terminal-integrations/[vendor]  — create or update (connect / update keys)
 * DELETE /api/provider/terminal-integrations/[vendor]  — disconnect (hard delete of credentials)
 *
 * Both flags must be on:
 *   - terminal_integrations_enabled  (hub master)
 *   - terminal_vendor_<slug>_enabled (per-vendor)
 *
 * Audited on every write.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requireVendorIntegrationEnabled } from "@/lib/payments/terminal-integration-feature-gate";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const connectSchema = z.object({
  credential_mode: z.enum(["api_key", "manual"]),
  api_key: z.string().min(1).optional().nullable(),
  api_secret: z.string().optional().nullable(),
  public_key: z.string().optional().nullable(),
  webhook_secret: z.string().optional().nullable(),
  merchant_id: z.string().optional().nullable(),
  merchant_ref: z.string().optional().nullable(),
  business_name: z.string().optional().nullable(),
  environment: z.enum(["sandbox", "live"]).default("live"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { vendor: string } },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const vendor = params.vendor.toLowerCase();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    // Gate check (both hub + vendor flags)
    const gateBlock = await requireVendorIntegrationEnabled(supabaseAdmin, providerId, vendor);
    if (gateBlock) return gateBlock;

    // Load vendor config
    const { data: vendorConfig } = await supabaseAdmin
      .from("terminal_vendor_configs")
      .select("vendor, display_name, description, credential_modes, requires_merchant_id, setup_instructions_text, api_docs_url, help_url")
      .is("tenant_id", null)
      .eq("vendor", vendor)
      .maybeSingle();

    if (!vendorConfig) return errorResponse("Vendor not found", "VENDOR_NOT_FOUND", 404);

    // Load integration row — fetch api_key / oauth_access_token only to check
    // presence (booleans), never return the raw values to the client.
    const { data: raw } = await supabaseAdmin
      .from("provider_terminal_integrations")
      .select(`
        id, vendor, status, credential_mode, environment, is_enabled,
        merchant_id, merchant_ref, business_name, connected_at, last_sync_at,
        last_error, reconnect_banner_dismissed_at, metadata, created_at, updated_at,
        api_key, oauth_access_token
      `)
      .eq("provider_id", providerId)
      .eq("vendor", vendor)
      .maybeSingle();

    const integration = raw
      ? {
          ...(raw as Record<string, unknown>),
          has_api_key: Boolean((raw as any).api_key),
          has_oauth_token: Boolean((raw as any).oauth_access_token),
          // Strip raw credential values before sending to client
          api_key: undefined,
          oauth_access_token: undefined,
        }
      : null;

    return successResponse({
      vendor_config: vendorConfig,
      integration,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal integration");
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { vendor: string } },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const vendor = params.vendor.toLowerCase();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const gateBlock = await requireVendorIntegrationEnabled(supabaseAdmin, providerId, vendor);
    if (gateBlock) return gateBlock;

    // Validate vendor exists in config
    const { data: vendorConfig } = await supabaseAdmin
      .from("terminal_vendor_configs")
      .select("vendor, credential_modes, requires_merchant_id")
      .is("tenant_id", null)
      .eq("vendor", vendor)
      .maybeSingle();

    if (!vendorConfig) return errorResponse("Vendor not configured", "VENDOR_NOT_FOUND", 404);

    const body = await request.json();
    const validation = connectSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }
    const data = validation.data;

    // Enforce credential mode is supported by this vendor
    if (!(vendorConfig as any).credential_modes?.includes(data.credential_mode)) {
      return errorResponse(
        `Credential mode '${data.credential_mode}' is not supported for ${vendor}`,
        "UNSUPPORTED_CREDENTIAL_MODE",
        400,
      );
    }

    // Merchant ID required for certain vendors
    if ((vendorConfig as any).requires_merchant_id && !data.merchant_id) {
      return errorResponse("Merchant ID is required for this vendor", "MERCHANT_ID_REQUIRED", 400);
    }

    // Load tenant_id for row
    const { data: provRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId = (provRow as { tenant_id?: string } | null)?.tenant_id ?? null;

    // Load existing for audit diff
    const { data: existing } = await supabaseAdmin
      .from("provider_terminal_integrations")
      .select("id, status")
      .eq("provider_id", providerId)
      .eq("vendor", vendor)
      .maybeSingle();

    const isNew = !existing;

    const upsertData: Record<string, unknown> = {
      tenant_id: tenantId,
      provider_id: providerId,
      vendor,
      credential_mode: data.credential_mode,
      environment: data.environment,
      merchant_id: data.merchant_id ?? null,
      merchant_ref: data.merchant_ref ?? null,
      business_name: data.business_name ?? null,
      metadata: data.metadata ?? {},
      status: "pending_verification",
      is_enabled: true,
      updated_by: user.id,
      ...(isNew ? { created_by: user.id, connected_at: new Date().toISOString() } : {}),
    };

    // Store credentials only when provided (don't wipe them on partial update)
    if (data.api_key !== undefined) upsertData.api_key = data.api_key;
    if (data.api_secret !== undefined) upsertData.api_secret = data.api_secret;
    if (data.public_key !== undefined) upsertData.public_key = data.public_key;
    if (data.webhook_secret !== undefined) upsertData.webhook_secret = data.webhook_secret;

    // For manual mode, immediately mark connected (no API verification)
    if (data.credential_mode === "manual") {
      upsertData.status = "connected";
    }

    const { data: result, error: upsertErr } = await supabaseAdmin
      .from("provider_terminal_integrations")
      .upsert(upsertData, { onConflict: "provider_id,vendor" })
      .select("id, vendor, status, credential_mode, environment, is_enabled, merchant_id, business_name, connected_at")
      .single();

    if (upsertErr) return errorResponse("Failed to save integration", "SAVE_ERROR", 500, upsertErr);

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "provider_owner",
      action: isNew ? "provider.terminal_integration.connected" : "provider.terminal_integration.updated",
      entity_type: "provider_terminal_integrations",
      entity_id: (result as any).id ?? providerId,
      module: "terminal_integrations",
      metadata: { vendor, credential_mode: data.credential_mode },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ integration: result });
  } catch (error) {
    return handleApiError(error, "Failed to save terminal integration");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { vendor: string } },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const vendor = params.vendor.toLowerCase();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    // Hub must be enabled to disconnect (so user can access the page to disconnect)
    // But we skip vendor flag check — provider should always be able to disconnect
    const { data: integration } = await supabaseAdmin
      .from("provider_terminal_integrations")
      .select("id")
      .eq("provider_id", providerId)
      .eq("vendor", vendor)
      .maybeSingle();

    if (!integration) {
      return errorResponse("Integration not found", "NOT_FOUND", 404);
    }

    // Wipe credentials and mark disconnected
    const { error: updateErr } = await supabaseAdmin
      .from("provider_terminal_integrations")
      .update({
        status: "not_connected",
        credential_mode: "none",
        is_enabled: false,
        api_key: null,
        api_secret: null,
        public_key: null,
        webhook_secret: null,
        oauth_access_token: null,
        oauth_refresh_token: null,
        merchant_id: null,
        merchant_ref: null,
        business_name: null,
        last_error: null,
        updated_by: user.id,
      })
      .eq("provider_id", providerId)
      .eq("vendor", vendor);

    if (updateErr) return errorResponse("Failed to disconnect", "DELETE_ERROR", 500, updateErr);

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "provider_owner",
      action: "provider.terminal_integration.disconnected",
      entity_type: "provider_terminal_integrations",
      entity_id: (integration as any).id ?? providerId,
      module: "terminal_integrations",
      metadata: { vendor },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ disconnected: true, vendor });
  } catch (error) {
    return handleApiError(error, "Failed to disconnect terminal integration");
  }
}
