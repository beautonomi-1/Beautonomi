import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { fetchScopedSingle, resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";

const mapboxConfigSchema = z.object({
  // access_token is a secret and is stored in platform_secrets; only update when provided
  access_token: z.string().optional().nullable(),
  // public token; optional on update (leave blank to keep current); required when creating new config
  public_access_token: z.string().optional().nullable(),
  style_url: z.string().url().optional().nullable(),
  is_enabled: z.boolean().default(true),
});

function isMaskedOrEmptyToken(value: string | null | undefined): boolean {
  if (!value || value === "***") return true;
  if (value.length <= 12 || value.endsWith("...")) return true;
  return false;
}

/**
 * GET /api/admin/mapbox/config
 * 
 * Get Mapbox configuration
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      undefined,
      user.role ?? null
    );
    const readTenantId =
      requestedScope.scope === "global" ? "" : requestedScope.tenantId ?? currentTenantId;

    const scoped = await fetchScopedSingle<Record<string, unknown>>({
      supabase,
      table: "mapbox_config",
      tenantId: readTenantId,
      select: "*",
      apply: (q) => q,
      orderBy: { column: "updated_at", ascending: false },
    });
    const config = scoped.data;

    // Response contains only non-secret config; secret token lives in platform_secrets
    type MapboxConfigRow = { public_access_token?: string; [key: string]: unknown };
    if (config) {
      const cfg = config as MapboxConfigRow;
      const maskedConfig = {
        ...(config as Record<string, unknown>),
        public_access_token: cfg.public_access_token
          ? `${cfg.public_access_token.substring(0, 8)}...`
          : null,
        access_token: "***",
      };
      return NextResponse.json({ data: maskedConfig, error: null });
    }

    return NextResponse.json({
      data: null,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/mapbox/config:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch Mapbox configuration",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/mapbox/config
 * 
 * Update Mapbox configuration
 */
export async function PUT(request: Request) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const validationResult = mapboxConfigSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    // If secret access_token provided (and not placeholder), store in platform_secrets
    const newAccessToken = validationResult.data.access_token?.trim();
    if (newAccessToken && newAccessToken !== "***") {
      let secretsQuery = admin.from("platform_secrets").select("id").limit(1);
      secretsQuery = scopeTenantId == null ? secretsQuery.is("tenant_id", null) : secretsQuery.eq("tenant_id", scopeTenantId);
      const { data: existingSecrets } = await secretsQuery.maybeSingle();
      if (existingSecrets?.id) {
        await admin
          .from("platform_secrets")
          .update({ mapbox_access_token: newAccessToken, tenant_id: scopeTenantId, updated_at: new Date().toISOString() })
          .eq("id", existingSecrets.id);
      } else {
        await admin.from("platform_secrets").insert({ mapbox_access_token: newAccessToken, tenant_id: scopeTenantId });
      }
    }

    // Resolve effective public token: new value if provided and not masked, else existing from DB
    let existingConfigQuery = supabase
      .from("mapbox_config")
      .select("id, public_access_token")
      .order("updated_at", { ascending: false })
      .limit(1);
    existingConfigQuery =
      scopeTenantId == null
        ? existingConfigQuery.is("tenant_id", null)
        : existingConfigQuery.eq("tenant_id", scopeTenantId);
    const { data: existingConfig } = await existingConfigQuery.maybeSingle();
    type ConfigRow = { id?: string; public_access_token?: string };
    const existingPublicToken = (existingConfig as ConfigRow | null)?.public_access_token ?? null;
    const sentPublicToken = validationResult.data.public_access_token?.trim();
    const useNewPublicToken = sentPublicToken && !isMaskedOrEmptyToken(sentPublicToken);
    const effectivePublicToken = useNewPublicToken ? sentPublicToken : (existingPublicToken || null);

    if (!existingConfig && !effectivePublicToken) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Public access token is required when creating Mapbox configuration",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    type MapboxConfigResult = { id: string; public_access_token?: string; style_url?: string; is_enabled?: boolean; [key: string]: unknown };
    let config: MapboxConfigResult | null = null;
    if (existingConfig) {
      const existingRow = existingConfig as ConfigRow & { id: string };
      const { data, error } = await supabase
        .from("mapbox_config")
        .update({
          tenant_id: scopeTenantId,
          ...(effectivePublicToken != null && { public_access_token: effectivePublicToken }),
          style_url: validationResult.data.style_url ?? null,
          is_enabled: validationResult.data.is_enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingRow.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating Mapbox config:", error);
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Failed to update Mapbox configuration",
              code: "UPDATE_ERROR",
            },
          },
          { status: 500 }
        );
      }
      config = data;
    } else {
      const { data, error } = await supabase
        .from("mapbox_config")
        .insert({
          tenant_id: scopeTenantId,
          public_access_token: effectivePublicToken!,
          style_url: validationResult.data.style_url || null,
          is_enabled: validationResult.data.is_enabled,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating Mapbox config:", error);
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Failed to create Mapbox configuration",
              code: "CREATE_ERROR",
            },
          },
          { status: 500 }
        );
      }
      config = data;
    }

    // Sync to platform_settings so web, customer, and provider apps get same config via third-party-config
    const publicTokenForClients = effectivePublicToken ?? (config?.public_access_token as string) ?? "";
    try {
      let psQuery = admin
        .from("platform_settings")
        .select("id, settings")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1);
      psQuery =
        scopeTenantId == null ? psQuery.is("tenant_id", null) : psQuery.eq("tenant_id", scopeTenantId);
      const { data: psRow } = await psQuery.maybeSingle();

      let rowToUse = psRow as { id?: string; settings?: Record<string, unknown> } | null;
      if (!rowToUse && scopeTenantId != null) {
        const { data: globalSettings } = await admin
          .from("platform_settings")
          .select("id, settings")
          .eq("is_active", true)
          .is("tenant_id", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        rowToUse = (globalSettings as { id?: string; settings?: Record<string, unknown> } | null) ?? null;
      }

      if (rowToUse?.settings) {
        type SettingsRow = { id?: string; settings?: Record<string, unknown> };
        const row = rowToUse as SettingsRow;
        const settings = { ...(row.settings ?? {}) };
        const mapbox = (settings.mapbox as Record<string, unknown>) ?? {};
        settings.mapbox = {
          ...mapbox,
          public_token: (publicTokenForClients || (mapbox.public_token as string)) ?? "",
          enabled: validationResult.data.is_enabled,
        };
        if (row.id && psRow?.id) {
          await admin
            .from("platform_settings")
            .update({ settings, tenant_id: scopeTenantId, updated_at: new Date().toISOString() })
            .eq("id", row.id);
        } else {
          await admin
            .from("platform_settings")
            .insert({ settings, tenant_id: scopeTenantId, is_active: true });
        }
      }
    } catch (syncErr) {
      console.warn("Mapbox config sync to platform_settings failed (non-blocking):", syncErr);
    }
    revalidateTag("platform-settings", "default");

    try {
      const { clearMapboxServiceSingleton } = await import("@/lib/mapbox/mapbox");
      clearMapboxServiceSingleton();
    } catch {
      // non-blocking
    }

    // Mask token in response
    const maskedConfig = {
      ...config,
      access_token: "***",
      public_access_token: config.public_access_token
        ? `${config.public_access_token.substring(0, 8)}...`
        : null,
    };

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.mapbox.config.update",
      entity_type: "mapbox_config",
      entity_id: config?.id ?? null,
      metadata: {
        is_enabled: validationResult.data.is_enabled,
        style_url: validationResult.data.style_url || null,
        public_access_token_set: !!validationResult.data.public_access_token,
        access_token_set: !!validationResult.data.access_token,
        scope: requestedScope.scope,
        tenant_id: scopeTenantId,
      },
    });

    return NextResponse.json({
      data: maskedConfig,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/mapbox/config:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update Mapbox configuration",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
