import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import { resolveResendCredentials } from "@/lib/integrations/resend";

const patchSchema = z.object({
  resend_api_key: z.string().optional(),
  resend_from_address: z.string().max(320).optional(),
  enabled: z.boolean().optional(),
});

function maskKey(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 8) return "***";
  return v.slice(0, 6) + "..." + v.slice(-4);
}

const PLATFORM_SECRETS_RESEND_FIELDS =
  "id, tenant_id, resend_api_key, resend_from_address, updated_at";

function hasResendKeyInRow(row: { resend_api_key?: string | null } | null): boolean {
  return !!row?.resend_api_key?.trim();
}

async function fetchResendSettings(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string | null,
): Promise<{ enabled: boolean }> {
  let query = supabase
    .from("platform_settings")
    .select("settings")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  query = tenantId == null ? query.is("tenant_id", null) : query.eq("tenant_id", tenantId);
  const { data } = await query.maybeSingle();
  const settings = (data as { settings?: Record<string, unknown> } | null)?.settings;
  const resend = (settings?.resend as { enabled?: boolean } | undefined) ?? {};
  return { enabled: resend.enabled !== false };
}

/**
 * GET /api/admin/integrations/resend
 * Masked Resend config for the admin SPA (secrets never returned in full).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      undefined,
      (user as { role?: string }).role ?? null,
    );
    const scopeTenantId =
      requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const supabase = getSupabaseAdmin();

    async function fetchSecretsRow(tenantId: string | null) {
      let q = supabase
        .from("platform_secrets")
        .select(PLATFORM_SECRETS_RESEND_FIELDS)
        .order("updated_at", { ascending: false })
        .limit(1);
      q = tenantId == null ? q.is("tenant_id", null) : q.eq("tenant_id", tenantId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    }

    let data = await fetchSecretsRow(scopeTenantId);
    let inherited_from_global = false;

    if (scopeTenantId != null && !hasResendKeyInRow(data as { resend_api_key?: string | null })) {
      const globalRow = await fetchSecretsRow(null);
      if (hasResendKeyInRow(globalRow as { resend_api_key?: string | null })) {
        data = globalRow;
        inherited_from_global = true;
      }
    }

    const env = {
      has_env_api_key: !!(
        process.env.RESEND_API_KEY?.trim() || process.env.EMAIL_PROVIDER_API_KEY?.trim()
      ),
      has_env_from_address: !!process.env.EMAIL_FROM_ADDRESS?.trim(),
    };

    const settings = await fetchResendSettings(supabase, scopeTenantId);
    const runtimeCreds = await resolveResendCredentials(supabase, scopeTenantId);
    const dbConfigured = hasResendKeyInRow(data as { resend_api_key?: string | null });
    const runtime_configured = !!runtimeCreds?.apiKey;

    const fromAddress =
      (data?.resend_from_address as string | null | undefined)?.trim() ||
      process.env.EMAIL_FROM_ADDRESS?.trim() ||
      runtimeCreds?.fromAddress ||
      null;

    return successResponse({
      configured: runtime_configured,
      configured_in_db: dbConfigured,
      enabled: settings.enabled,
      masked_api_key: maskKey(data?.resend_api_key as string | null | undefined),
      from_address: fromAddress,
      has_from_address: !!fromAddress,
      updated_at: data?.updated_at,
      inherited_from_global,
      secrets_scope: inherited_from_global ? "global" : scopeTenantId == null ? "global" : "tenant",
      env,
      usage_note:
        "Transactional email: notification queue, admin email broadcasts, guest portal links, and shadow-account claim invites.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch Resend configuration");
  }
}

/**
 * PATCH /api/admin/integrations/resend
 * Update Resend API key / from address in platform_secrets. Integrations admin access.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const body = await request.json();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      (user as { role?: string }).role ?? null,
    );
    const scopeTenantId =
      requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }

    const supabase = getSupabaseAdmin();
    const updates: Record<string, string | null> = {};

    if ("resend_api_key" in parsed.data) {
      updates.resend_api_key = parsed.data.resend_api_key?.trim() || null;
    }
    if ("resend_from_address" in parsed.data) {
      updates.resend_from_address = parsed.data.resend_from_address?.trim() || null;
    }

    if ("enabled" in parsed.data) {
      let settingsQuery = supabase
        .from("platform_settings")
        .select("id, settings")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1);
      settingsQuery =
        scopeTenantId == null
          ? settingsQuery.is("tenant_id", null)
          : settingsQuery.eq("tenant_id", scopeTenantId);
      const { data: settingsRow } = await settingsQuery.maybeSingle();

      if (settingsRow?.id) {
        const existing = (settingsRow as { settings?: Record<string, unknown> }).settings ?? {};
        const nextSettings = {
          ...existing,
          resend: {
            ...((existing.resend as Record<string, unknown> | undefined) ?? {}),
            enabled: parsed.data.enabled,
          },
        };
        await supabase
          .from("platform_settings")
          .update({ settings: nextSettings, updated_at: new Date().toISOString() })
          .eq("id", settingsRow.id);
      }
    }

    if (Object.keys(updates).length === 0) {
      if ("enabled" in parsed.data) {
        await writeAuditLog({
          actor_user_id: user.id,
          actor_role: (user as { role?: string }).role ?? "admin",
          action: "admin.integrations.resend.enabled.updated",
          entity_type: "platform_settings",
          metadata: { enabled: parsed.data.enabled, scope: scopeTenantId == null ? "global" : "tenant" },
        });
        return successResponse({ message: "Resend settings updated" });
      }
      return errorResponse("No fields to update", "VALIDATION_ERROR", 400);
    }

    let existingQuery = supabase
      .from("platform_secrets")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1);
    existingQuery =
      scopeTenantId == null
        ? existingQuery.is("tenant_id", null)
        : existingQuery.eq("tenant_id", scopeTenantId);
    const { data: existing } = await existingQuery.maybeSingle();

    const payload = {
      ...updates,
      tenant_id: scopeTenantId,
      updated_at: new Date().toISOString(),
    };

    let opError;
    if (existing?.id) {
      const { error } = await supabase.from("platform_secrets").update(payload).eq("id", existing.id);
      opError = error;
    } else {
      const { error } = await supabase.from("platform_secrets").insert(payload);
      opError = error;
    }

    if (opError) throw opError;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "admin",
      action: "admin.integrations.resend.keys.updated",
      entity_type: "platform_secrets",
      metadata: { fields_updated: Object.keys(updates) },
    });

    return successResponse({ message: "Resend configuration updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update Resend configuration");
  }
}
