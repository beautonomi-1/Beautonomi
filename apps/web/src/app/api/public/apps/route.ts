import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import { getDefaultPublicAppsResponse } from "@/lib/store/native-app-store";

/**
 * GET /api/public/apps
 *
 * Public endpoint to get app information for customer and provider apps.
 * Always returns 200 with default data on any error so callers never get 500.
 *
 * Default bundle IDs match Expo app.json in apps/customer and apps/provider (see native-app-store.ts).
 */
const DEFAULT_APPS_RESPONSE = getDefaultPublicAppsResponse();

function getDefaultAppsData(appType: string, platform: string | null) {
  const defaultApps = DEFAULT_APPS_RESPONSE as Record<string, Record<string, any>>;
  if (platform) {
    return defaultApps[appType]?.[platform] ?? defaultApps.customer?.[platform] ?? defaultApps.customer?.android;
  }
  return defaultApps[appType] ?? defaultApps.customer;
}

function safeJson(data: any) {
  return NextResponse.json({ data, error: null }, { status: 200 });
}

export async function GET(request: NextRequest) {
  let appType = "customer";
  let platform: string | null = null;
  try {
    const { searchParams } = new URL(request.url ?? "");
    appType = searchParams.get("type") || "customer";
    platform = searchParams.get("platform");
  } catch {
    // use defaults
  }

  try {
    let appsSettings: any = null;
    const supabase = await getSupabaseServer(request);
    const tenant = await resolveTenantFromRequest(request as Request);
    const tenantId = tenant?.id ?? "";
    if (supabase) {
      let tenantSettings: { settings?: unknown } | null = null;
      let tenantSettingsError: unknown = null;
      if (tenantId) {
        const tenantRes = await supabase
          .from("platform_settings")
          .select("settings")
          .eq("is_active", true)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        tenantSettings = (tenantRes.data as { settings?: unknown } | null) ?? null;
        tenantSettingsError = tenantRes.error ?? null;
      }
      const { data: globalSettings, error: globalSettingsError } = await supabase
        .from("platform_settings")
        .select("settings")
        .eq("is_active", true)
        .is("tenant_id", null)
        .maybeSingle();
      const settings = tenantSettings ?? globalSettings;
      const settingsError = tenantSettingsError ?? globalSettingsError;

      if (!settingsError && settings && typeof settings === "object" && settings !== null && "settings" in settings) {
        const s = (settings as { settings?: { apps?: any } }).settings;
        if (s && typeof s === "object" && "apps" in s) appsSettings = (s as { apps: any }).apps;
      }
    }

    if (appsSettings && typeof appsSettings === "object" && appsSettings !== null) {
      const apps = appsSettings as Record<string, Record<string, any>>;
      if (platform) {
        const platformData = apps?.[appType]?.[platform] as { enabled?: boolean } | undefined;
        if (platformData && platformData.enabled) {
          return safeJson(apps[appType]?.[platform]);
        }
      } else {
        const appTypeData = apps?.[appType];
        if (appTypeData) return safeJson(appTypeData);
      }
    }
  } catch (err) {
    console.warn("Error in /api/public/apps, using defaults:", err);
  }

  return safeJson(getDefaultAppsData(appType, platform));
}
