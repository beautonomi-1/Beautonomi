/**
 * GET  /api/admin/commercial/terminal-vendors   — list all vendor configs
 * POST /api/admin/commercial/terminal-vendors   — add a new vendor config
 *
 * Gated by ADMIN_SECTION_COMMERCIAL.
 * Superadmin configures vendors here; providers connect via /api/provider/terminal-integrations/[vendor].
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
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const createVendorSchema = z.object({
  vendor: z.string().min(1).regex(/^[a-z0-9_]+$/, "Vendor must be lowercase snake_case"),
  display_name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
  help_url: z.string().url().optional().nullable(),
  enabled: z.boolean().default(false),
  credential_modes: z.array(z.enum(["api_key", "oauth", "manual"])).min(1).default(["api_key"]),
  requires_merchant_id: z.boolean().default(false),
  setup_instructions_text: z.string().optional().nullable(),
  api_docs_url: z.string().url().optional().nullable(),
  feature_flag_key: z.string().optional().nullable(),
  // OAuth fields (optional — populate when vendor supports OAuth)
  oauth_authorize_url: z.string().url().optional().nullable(),
  oauth_token_url: z.string().url().optional().nullable(),
  oauth_client_id: z.string().optional().nullable(),
  oauth_client_secret: z.string().optional().nullable(),
  oauth_scopes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("terminal_vendor_configs")
      .select("*")
      .order("display_name");

    if (error) return errorResponse("Failed to load vendor configs", "LOAD_ERROR", 500, error);

    // Mask OAuth secrets before returning
    const masked = (data ?? []).map((v: any) => ({
      ...v,
      oauth_client_secret: v.oauth_client_secret ? "••••••••" : null,
    }));

    return successResponse({ vendors: masked });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal vendor configs");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const body = await request.json();
    const validation = createVendorSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }

    // Prevent duplicate global vendor
    const { data: existing } = await supabase
      .from("terminal_vendor_configs")
      .select("id")
      .is("tenant_id", null)
      .eq("vendor", validation.data.vendor)
      .maybeSingle();

    if (existing) {
      return errorResponse(
        `Vendor '${validation.data.vendor}' already exists. Use PATCH to update it.`,
        "VENDOR_EXISTS",
        409,
      );
    }

    const { data, error } = await supabase
      .from("terminal_vendor_configs")
      .insert({ ...validation.data, tenant_id: null })
      .select()
      .single();

    if (error) return errorResponse("Failed to create vendor", "SAVE_ERROR", 500, error);

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role ?? "superadmin",
      action: "admin.terminal_vendor.created",
      entity_type: "terminal_vendor_configs",
      entity_id: (data as any).id ?? validation.data.vendor,
      module: "terminal_integrations",
      after_json: { ...validation.data, oauth_client_secret: "[REDACTED]" },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ vendor: { ...(data as any), oauth_client_secret: data && (data as any).oauth_client_secret ? "••••••••" : null } }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create terminal vendor");
  }
}
