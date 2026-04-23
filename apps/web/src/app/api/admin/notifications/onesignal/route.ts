import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSectionAny,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import {
  ADMIN_SECTION_INTEGRATIONS_DEV,
  ADMIN_SECTION_MARKETING_COMMS,
  ADMIN_SECTION_PLATFORM_CONFIG,
} from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";

const patchBodySchema = z.object({
  scope: z.enum(["global", "tenant"]).optional(),
  tenant_id: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  enabled: z.boolean().optional(),
  customer: z
    .object({
      app_id: z.string().optional().nullable(),
      rest_api_key: z.string().optional().nullable(),
    })
    .optional(),
  provider: z
    .object({
      app_id: z.string().optional().nullable(),
      rest_api_key: z.string().optional().nullable(),
    })
    .optional(),
});

function mergeSecretField(
  incoming: string | undefined | null,
  existing: string | null | undefined
): string | null {
  const t = typeof incoming === "string" ? incoming.trim() : "";
  if (!t || t === "***") return (existing && String(existing).trim()) || null;
  return t;
}

/**
 * PATCH /api/admin/notifications/onesignal
 *
 * Update OneSignal App IDs (platform_settings) and REST keys (platform_secrets) for
 * customer vs provider apps — same persistence as Superadmin → Platform settings.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSectionAny(
      [ADMIN_SECTION_PLATFORM_CONFIG, ADMIN_SECTION_MARKETING_COMMS, ADMIN_SECTION_INTEGRATIONS_DEV],
      request
    );

    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = patchBodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(parsed.error.flatten().formErrors.join("; ") || "Invalid body", "VALIDATION_ERROR", 400);
    }
    const body = parsed.data;

    const supabase = getSupabaseAdmin();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      raw,
      user.role ?? null
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    let existingQuery = supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    existingQuery =
      scopeTenantId == null ? existingQuery.is("tenant_id", null) : existingQuery.eq("tenant_id", scopeTenantId);

    const { data: existingRow, error: loadErr } = await existingQuery.maybeSingle();
    if (loadErr) throw loadErr;
    if (!existingRow?.id || !existingRow.settings || typeof existingRow.settings !== "object") {
      return errorResponse(
        "No platform settings row found for this scope. Open Platform settings once (Superadmin) to initialize, then save OneSignal here again.",
        "PLATFORM_SETTINGS_MISSING",
        409
      );
    }

    const settings = { ...(existingRow.settings as Record<string, unknown>) };
    const prevOs = (settings.onesignal as Record<string, unknown> | undefined) ?? {};

    const nextCustomerId =
      body.customer?.app_id !== undefined && body.customer?.app_id !== null
        ? String(body.customer.app_id).trim()
        : (prevOs.app_id as string | undefined) ?? "";
    const nextProviderId =
      body.provider?.app_id !== undefined && body.provider?.app_id !== null
        ? String(body.provider.app_id).trim()
        : (prevOs.app_id_provider as string | undefined) ?? "";

    settings.onesignal = {
      ...prevOs,
      app_id: nextCustomerId,
      app_id_provider: nextProviderId || undefined,
      enabled: body.enabled !== undefined ? body.enabled : prevOs.enabled !== false,
      rest_api_key: "",
      rest_api_key_provider: "",
    };

    let secretQuery = supabase
      .from("platform_secrets")
      .select("id, onesignal_rest_api_key, onesignal_rest_api_key_provider")
      .order("updated_at", { ascending: false })
      .limit(1);
    secretQuery =
      scopeTenantId == null ? secretQuery.is("tenant_id", null) : secretQuery.eq("tenant_id", scopeTenantId);
    const { data: existingSecretRow } = await secretQuery.maybeSingle();
    const prev = existingSecretRow as Record<string, string | null | undefined> | null;

    const hasSecretUpdate =
      (body.customer?.rest_api_key != null && String(body.customer.rest_api_key).trim() !== "") ||
      (body.provider?.rest_api_key != null && String(body.provider.rest_api_key).trim() !== "");

    if (hasSecretUpdate || existingSecretRow?.id) {
      const secretPayload: Record<string, unknown> = {
        tenant_id: scopeTenantId,
        onesignal_rest_api_key: mergeSecretField(
          body.customer?.rest_api_key ?? undefined,
          prev?.onesignal_rest_api_key
        ),
        onesignal_rest_api_key_provider: mergeSecretField(
          body.provider?.rest_api_key ?? undefined,
          prev?.onesignal_rest_api_key_provider
        ),
        updated_at: new Date().toISOString(),
      };

      if (existingSecretRow?.id) {
        const { error: upErr } = await supabase
          .from("platform_secrets")
          .update(secretPayload)
          .eq("id", existingSecretRow.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase.from("platform_secrets").insert(secretPayload);
        if (insErr) throw insErr;
      }
    }

    const { error: updErr } = await supabase
      .from("platform_settings")
      .update({
        settings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingRow.id);
    if (updErr) throw updErr;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.notifications.onesignal.update",
      entity_type: "platform_settings",
      entity_id: existingRow.id,
      module: "notifications",
      risk_level: "high",
      retention_tier: "operational",
      metadata: {
        scope: requestedScope.scope,
        tenant_id: scopeTenantId,
        updated_app_ids: !!(body.customer?.app_id != null || body.provider?.app_id != null),
        updated_rest_keys: hasSecretUpdate,
      },
      ...extractRequestMeta(request),
    });

    revalidateTag("platform-settings", "max");

    return successResponse({
      ok: true,
      message:
        "OneSignal settings saved. Customer/provider App IDs must match EXPO_PUBLIC_ONESIGNAL_APP_ID in each mobile app. REST keys are server-only.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to update OneSignal configuration");
  }
}
