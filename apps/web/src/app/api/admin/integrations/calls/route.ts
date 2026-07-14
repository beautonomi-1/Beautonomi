import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { fetchScopedSingle, resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import { getCallsIntegrationConfig } from "@/lib/integrations/calls-config";

function mergeSecretField(
  incoming: string | undefined | null,
  existing: string | null | undefined,
): string | null {
  const t = typeof incoming === "string" ? incoming.trim() : "";
  if (!t || t === "***") return (existing && String(existing).trim()) || null;
  return t;
}

function appOrigin(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    request.nextUrl.origin
  );
}

function toSafeResponse(
  request: NextRequest,
  config: Record<string, unknown> | null,
  secrets: Record<string, unknown> | null,
  twilioVoiceConfigured: boolean,
) {
  const origin = appOrigin(request);
  return {
    twilio_voice_enabled: Boolean(config?.twilio_voice_enabled),
    salestrail_enabled: Boolean(config?.salestrail_enabled),
    salestrail_webhook_username: config?.salestrail_webhook_username ?? null,
    salestrail_webhook_password_set: Boolean(config?.salestrail_webhook_password),
    salestrail_default_tenant_id: config?.salestrail_default_tenant_id ?? null,
    twilio_api_key_sid: secrets?.twilio_api_key_sid ?? null,
    twilio_api_key_secret_set: Boolean(secrets?.twilio_api_key_secret),
    twilio_twiml_app_sid: secrets?.twilio_twiml_app_sid ?? null,
    twilio_voice_from: secrets?.twilio_voice_from ?? null,
    twilio_voice_configured: twilioVoiceConfigured,
    twilio_twiml_webhook_url: `${origin}/api/webhooks/twilio/voice`,
    salestrail_webhook_url: `${origin}/api/webhooks/salestrail`,
    updated_at: config?.updated_at ?? null,
  };
}

/**
 * GET /api/admin/integrations/calls
 * Superadmin: read Twilio Voice + Salestrail integration config.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    if (user.role !== "superadmin") {
      return errorResponse("Superadmin access required", "FORBIDDEN", 403);
    }

    const supabase = getSupabaseAdmin();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      undefined,
      user.role ?? null,
    );
    const readTenantId =
      requestedScope.scope === "global" ? "" : requestedScope.tenantId ?? currentTenantId;

    const configScoped = await fetchScopedSingle<Record<string, unknown>>({
      supabase,
      table: "voice_integration_config",
      tenantId: readTenantId,
      select: "*",
      apply: (q) => q,
      orderBy: { column: "updated_at", ascending: false },
    });

    const secretsScoped = await fetchScopedSingle<Record<string, unknown>>({
      supabase,
      table: "platform_secrets",
      tenantId: readTenantId,
      select:
        "twilio_api_key_sid, twilio_api_key_secret, twilio_twiml_app_sid, twilio_voice_from",
      apply: (q) => q,
      orderBy: { column: "updated_at", ascending: false },
    });

    const tenantForStatus =
      requestedScope.scope === "global" ? "" : readTenantId || currentTenantId;
    const { twilioVoiceConfigured } = await getCallsIntegrationConfig(
      supabase,
      tenantForStatus,
    );

    const secrets = secretsScoped.data;
    const safeSecrets = secrets
      ? {
          ...secrets,
          twilio_api_key_secret: secrets.twilio_api_key_secret ? "***" : null,
        }
      : null;

    return successResponse(
      toSafeResponse(
        request,
        configScoped.data,
        safeSecrets,
        twilioVoiceConfigured,
      ),
    );
  } catch (error) {
    return handleApiError(error, "Failed to fetch calls integration config");
  }
}

/**
 * PUT /api/admin/integrations/calls
 * Superadmin: update toggles, Salestrail creds, and Twilio Voice secrets.
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    if (user.role !== "superadmin") {
      return errorResponse("Superadmin access required", "FORBIDDEN", 403);
    }

    const body = await request.json();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null,
    );
    const scopeTenantId =
      requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const supabase = getSupabaseAdmin();

    let beforeConfigQuery = supabase.from("voice_integration_config").select("*");
    beforeConfigQuery =
      scopeTenantId == null
        ? beforeConfigQuery.is("tenant_id", null)
        : beforeConfigQuery.eq("tenant_id", scopeTenantId);
    const { data: beforeConfig } = await beforeConfigQuery.maybeSingle();

    const configPayload: Record<string, unknown> = {
      tenant_id: scopeTenantId,
      twilio_voice_enabled: Boolean(body.twilio_voice_enabled),
      salestrail_enabled: Boolean(body.salestrail_enabled),
      salestrail_webhook_username:
        typeof body.salestrail_webhook_username === "string"
          ? body.salestrail_webhook_username.trim() || null
          : (beforeConfig as { salestrail_webhook_username?: string } | null)
              ?.salestrail_webhook_username ?? null,
      salestrail_default_tenant_id:
        typeof body.salestrail_default_tenant_id === "string"
          ? body.salestrail_default_tenant_id.trim() || null
          : (beforeConfig as { salestrail_default_tenant_id?: string } | null)
              ?.salestrail_default_tenant_id ?? null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    if (
      body.salestrail_webhook_password !== undefined &&
      body.salestrail_webhook_password !== "***"
    ) {
      configPayload.salestrail_webhook_password =
        typeof body.salestrail_webhook_password === "string"
          ? body.salestrail_webhook_password.trim() || null
          : null;
    } else if (beforeConfig) {
      configPayload.salestrail_webhook_password = (
        beforeConfig as { salestrail_webhook_password?: string }
      ).salestrail_webhook_password;
    }

    let afterConfig: Record<string, unknown> | null = null;
    if ((beforeConfig as { id?: string } | null)?.id) {
      const { data, error } = await supabase
        .from("voice_integration_config")
        .update(configPayload)
        .eq("id", (beforeConfig as { id: string }).id)
        .select("*")
        .single();
      if (error) throw error;
      afterConfig = data as Record<string, unknown>;
    } else {
      const { data, error } = await supabase
        .from("voice_integration_config")
        .insert(configPayload)
        .select("*")
        .single();
      if (error) throw error;
      afterConfig = data as Record<string, unknown>;
    }

    let secretsQuery = supabase.from("platform_secrets").select("*");
    secretsQuery =
      scopeTenantId == null
        ? secretsQuery.is("tenant_id", null)
        : secretsQuery.eq("tenant_id", scopeTenantId);
    const { data: prevSecrets } = await secretsQuery.maybeSingle();
    const prev = prevSecrets as Record<string, unknown> | null;

    const secretPayload: Record<string, unknown> = {
      tenant_id: scopeTenantId,
      twilio_api_key_sid: mergeSecretField(
        body.twilio_api_key_sid,
        prev?.twilio_api_key_sid as string | null,
      ),
      twilio_api_key_secret: mergeSecretField(
        body.twilio_api_key_secret,
        prev?.twilio_api_key_secret as string | null,
      ),
      twilio_twiml_app_sid: mergeSecretField(
        body.twilio_twiml_app_sid,
        prev?.twilio_twiml_app_sid as string | null,
      ),
      twilio_voice_from: mergeSecretField(
        body.twilio_voice_from,
        prev?.twilio_voice_from as string | null,
      ),
      updated_at: new Date().toISOString(),
    };

    if (prev?.id) {
      await supabase
        .from("platform_secrets")
        .update(secretPayload)
        .eq("id", prev.id as string);
    } else {
      await supabase.from("platform_secrets").insert(secretPayload);
    }

    const tenantForStatus = scopeTenantId == null ? "" : scopeTenantId;
    const { twilioVoiceConfigured } = await getCallsIntegrationConfig(
      supabase,
      tenantForStatus,
    );

    const { data: updatedSecrets } = await (
      scopeTenantId == null
        ? supabase.from("platform_secrets").select("*").is("tenant_id", null)
        : supabase.from("platform_secrets").select("*").eq("tenant_id", scopeTenantId)
    ).maybeSingle();

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.integrations.calls.update",
      entity_type: "voice_integration_config",
      entity_id: String(afterConfig?.id ?? "new"),
      module: "integrations",
      risk_level: "high",
      retention_tier: "operational",
      metadata: {
        twilio_voice_enabled: configPayload.twilio_voice_enabled,
        salestrail_enabled: configPayload.salestrail_enabled,
      },
      ...extractRequestMeta(request),
    });

    const safeSecrets = updatedSecrets
      ? {
          ...(updatedSecrets as Record<string, unknown>),
          twilio_api_key_secret: (updatedSecrets as { twilio_api_key_secret?: string })
            .twilio_api_key_secret
            ? "***"
            : null,
        }
      : null;

    return successResponse(
      toSafeResponse(request, afterConfig, safeSecrets, twilioVoiceConfigured),
    );
  } catch (error) {
    return handleApiError(error, "Failed to update calls integration config");
  }
}
