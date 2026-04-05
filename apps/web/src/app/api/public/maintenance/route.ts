import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { MaintenanceScope, PublicMaintenanceResponse } from "@/lib/maintenance-types";
import { MAINTENANCE_SCOPES, defaultMaintenanceConfig } from "@/lib/maintenance-types";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";

/**
 * GET /api/public/maintenance?scope=public_site|provider_web|customer_app|provider_app
 *
 * Returns maintenance config for the given scope (read-only, cached briefly).
 * Used by customer public site, provider web, and mobile apps to show maintenance/coming-soon.
 */
export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope") as MaintenanceScope | null;
  if (!scope || !MAINTENANCE_SCOPES.includes(scope)) {
    return NextResponse.json(
      { error: "Invalid or missing scope. Use one of: public_site, provider_web, customer_app, provider_app" },
      { status: 400 }
    );
  }

  try {
    const supabase = await getSupabaseServer();
    const tenant = await resolveTenantFromRequest(request as Request);
    const tenantId = tenant?.id ?? "";
    let tenantRow: { settings?: unknown } | null = null;
    let tenantError: unknown = null;
    if (tenantId) {
      const tenantRes = await supabase
        .from("platform_settings")
        .select("settings")
        .eq("is_active", true)
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle();
      tenantRow = (tenantRes.data as { settings?: unknown } | null) ?? null;
      tenantError = tenantRes.error ?? null;
    }
    const { data: globalRow, error: globalError } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .is("tenant_id", null)
      .limit(1)
      .maybeSingle();
    let row = tenantRow ?? globalRow;
    let error: unknown = tenantError ?? globalError;

    // DBs without migration 354 (platform_settings.tenant_id): fall back to legacy single active row.
    const missingColumn = (e: unknown) =>
      Boolean(e && typeof e === "object" && "code" in e && (e as { code: string }).code === "42703");
    if (missingColumn(tenantError) || missingColumn(globalError)) {
      const legacy = await supabase
        .from("platform_settings")
        .select("settings")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      row = legacy.data as { settings?: unknown } | null;
      error = legacy.error ?? null;
    }

    if (error) {
      console.error("Error fetching platform_settings for maintenance:", error);
      return NextResponse.json(emptyResponse(), {
        status: 200,
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
      });
    }

    const settings = (row as { settings?: Record<string, unknown> } | null)?.settings;
    const maintenance = (settings?.maintenance as Record<string, PublicMaintenanceResponse> | undefined) ?? {};
    const config = maintenance[scope];

    const base = defaultMaintenanceConfig();
    const out: PublicMaintenanceResponse = {
      enabled: Boolean(config?.enabled),
      title: typeof config?.title === "string" ? config.title : base.title,
      message: typeof config?.message === "string" ? config.message : base.message,
      cta_label: config?.cta_label ?? null,
      countdown_end_at: config?.countdown_end_at ?? null,
      countdown_label: config?.countdown_label ?? null,
    };

    return NextResponse.json(out, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (e) {
    console.error("Unexpected error in /api/public/maintenance:", e);
    return NextResponse.json(emptyResponse(), {
      status: 200,
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  }
}

function emptyResponse(): PublicMaintenanceResponse {
  const d = defaultMaintenanceConfig();
  return {
    enabled: false,
    title: d.title,
    message: d.message,
    cta_label: null,
    countdown_end_at: null,
    countdown_label: null,
  };
}
