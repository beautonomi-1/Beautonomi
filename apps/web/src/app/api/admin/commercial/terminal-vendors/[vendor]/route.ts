/**
 * GET   /api/admin/commercial/terminal-vendors/[vendor]  — get vendor config
 * PATCH /api/admin/commercial/terminal-vendors/[vendor]  — update vendor (enable/disable, set OAuth creds, etc.)
 *
 * This is the main Superadmin endpoint for configuring a vendor integration before
 * it becomes available to providers. Mirrors /api/admin/integrations/yoco pattern.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const updateVendorSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
  help_url: z.string().url().optional().nullable(),
  enabled: z.boolean().optional(),
  credential_modes: z.array(z.enum(["api_key", "oauth", "manual"])).min(1).optional(),
  requires_merchant_id: z.boolean().optional(),
  setup_instructions_text: z.string().optional().nullable(),
  api_docs_url: z.string().url().optional().nullable(),
  api_base_url: z.string().url().optional().nullable(),
  feature_flag_key: z.string().optional().nullable(),
  // OAuth settings
  oauth_authorize_url: z.string().url().optional().nullable(),
  oauth_token_url: z.string().url().optional().nullable(),
  oauth_revoke_url: z.string().url().optional().nullable(),
  oauth_client_id: z.string().optional().nullable(),
  oauth_client_secret: z.string().optional().nullable(),
  oauth_scopes: z.string().optional().nullable(),
  oauth_redirect_path: z.string().optional().nullable(),
  // Webhook config
  webhook_receive_path: z.string().optional().nullable(),
  requires_webhook_setup: z.boolean().optional(),
  // Metadata
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { vendor: string } },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const supabase = getSupabaseAdmin();
    const vendor = params.vendor.toLowerCase();

    const { data, error } = await supabase
      .from("terminal_vendor_configs")
      .select("*")
      .is("tenant_id", null)
      .eq("vendor", vendor)
      .maybeSingle();

    if (error) return errorResponse("Failed to load vendor", "LOAD_ERROR", 500, error);
    if (!data) return errorResponse("Vendor not found", "NOT_FOUND", 404);

    // Summarise connection stats
    const { count: connectedProviders } = await supabase
      .from("provider_terminal_integrations")
      .select("id", { count: "exact", head: true })
      .eq("vendor", vendor)
      .eq("status", "connected");

    return successResponse({
      vendor: {
        ...(data as any),
        oauth_client_secret: (data as any).oauth_client_secret ? "••••••••" : null,
      },
      stats: {
        connected_providers: connectedProviders ?? 0,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal vendor");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { vendor: string } },
) {
  try {
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const supabase = getSupabaseAdmin();
    const vendor = params.vendor.toLowerCase();

    const { data: existing } = await supabase
      .from("terminal_vendor_configs")
      .select("id, enabled")
      .is("tenant_id", null)
      .eq("vendor", vendor)
      .maybeSingle();

    if (!existing) return errorResponse("Vendor not found", "NOT_FOUND", 404);

    const body = await request.json();
    const validation = updateVendorSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }

    const updates = validation.data as Record<string, unknown>;

    const { data, error } = await supabase
      .from("terminal_vendor_configs")
      .update(updates)
      .is("tenant_id", null)
      .eq("vendor", vendor)
      .select()
      .single();

    if (error) return errorResponse("Failed to update vendor", "SAVE_ERROR", 500, error);

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role ?? "superadmin",
      action: "admin.terminal_vendor.updated",
      entity_type: "terminal_vendor_configs",
      entity_id: (existing as any).id ?? vendor,
      module: "terminal_integrations",
      before_json: { vendor, enabled: (existing as any).enabled },
      after_json: { ...updates, oauth_client_secret: updates.oauth_client_secret ? "[REDACTED]" : undefined },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({
      vendor: {
        ...(data as any),
        oauth_client_secret: (data as any).oauth_client_secret ? "••••••••" : null,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to update terminal vendor");
  }
}
