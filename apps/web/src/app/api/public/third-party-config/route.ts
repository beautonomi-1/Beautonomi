import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";

/**
 * GET /api/public/third-party-config
 *
 * Public endpoint to get third-party service configuration (safe keys only).
 * Query: service=onesignal|mapbox|amplitude|google, app=customer|provider (for OneSignal two-app).
 * Cache key includes service and app so customer vs provider get correct OneSignal app_id.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const service = searchParams.get("service") ?? "";
  const app = searchParams.get("app") ?? "";
  let tenantId = "";
  try {
    const tenant = await resolveTenantFromRequest(request);
    tenantId = tenant?.id ?? "";
  } catch {
    tenantId = "";
  }

  try {
    const result = await getCachedThirdPartyConfig(service, app, tenantId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching third-party config:", error);
    // Mobile clients treat 500 as noisy Sentry events; empty config degrades gracefully (no push/maps until fixed).
    return NextResponse.json({ data: {}, error: null });
  }
}

async function getCachedThirdPartyConfig(service: string, app: string, tenantId: string) {
  return unstable_cache(
    async () => {
      try {
      const supabase = await getSupabaseServer();
      let tenantSettings: { settings?: unknown } | null = null;
      if (tenantId) {
        const { data } = await supabase
          .from("platform_settings")
          .select("settings")
          .eq("is_active", true)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        tenantSettings = (data as { settings?: unknown } | null) ?? null;
      }
      const { data: globalSettings } = await supabase
        .from("platform_settings")
        .select("settings")
        .eq("is_active", true)
        .is("tenant_id", null)
        .maybeSingle();

      type SettingsRow = { settings?: { onesignal?: { enabled?: boolean; app_id?: string; app_id_provider?: string; safari_web_id?: string }; mapbox?: { enabled?: boolean; public_token?: string }; amplitude?: { enabled?: boolean; api_key?: string }; google?: { enabled?: boolean; maps_api_key?: string; places_api_key?: string; analytics_id?: string } } };
      const s = (tenantSettings ?? globalSettings) as SettingsRow | null;
      if (s?.settings) {
        const config: Record<string, unknown> = {};
        const svc = service || undefined;
        const appType = app || undefined;

        if (!svc || svc === "onesignal") {
          const onesignal = s.settings.onesignal;
          if (onesignal?.enabled) {
            const isProvider = appType === "provider";
            const appId =
              (isProvider
                ? onesignal.app_id_provider ?? process.env.ONESIGNAL_APP_ID_PROVIDER
                : onesignal.app_id ?? process.env.ONESIGNAL_APP_ID_CUSTOMER) ??
              onesignal.app_id;
            config.onesignal = {
              app_id: appId,
              safari_web_id: onesignal.safari_web_id,
              enabled: true,
            };
          }
        }

        // Mapbox - single source for web + mobile: prefer mapbox_config (Admin > Mapbox); fallback to platform_settings
        if (!svc || svc === "mapbox") {
          let mapboxConfigRow: { public_access_token?: string; style_url?: string; is_enabled?: boolean } | null = null;
          if (tenantId) {
            const { data: tenantMapboxConfig } = await supabase
              .from("mapbox_config")
              .select("public_access_token, style_url, is_enabled")
              .eq("is_enabled", true)
              .eq("tenant_id", tenantId)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            mapboxConfigRow = (tenantMapboxConfig as typeof mapboxConfigRow) ?? null;
          }
          if (!mapboxConfigRow) {
            const { data: globalMapboxConfig } = await supabase
              .from("mapbox_config")
              .select("public_access_token, style_url, is_enabled")
              .eq("is_enabled", true)
              .is("tenant_id", null)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            mapboxConfigRow = (globalMapboxConfig as typeof mapboxConfigRow) ?? null;
          }

          if (mapboxConfigRow?.public_access_token) {
            config.mapbox = {
              public_token: mapboxConfigRow.public_access_token,
              style_url: (mapboxConfigRow as { style_url?: string }).style_url ?? undefined,
              enabled: true,
            };
          } else if (s.settings.mapbox?.enabled && s.settings.mapbox?.public_token) {
            config.mapbox = {
              public_token: s.settings.mapbox.public_token,
              enabled: true,
            };
          }
        }

        if (!svc || svc === "amplitude") {
          if (s.settings.amplitude?.enabled) {
            config.amplitude = {
              api_key: s.settings.amplitude.api_key,
              enabled: true,
            };
          }
        }

        if (!svc || svc === "google") {
          if (s.settings.google?.enabled) {
            config.google = {
              maps_api_key: s.settings.google.maps_api_key,
              places_api_key: s.settings.google.places_api_key,
              analytics_id: s.settings.google.analytics_id,
              enabled: true,
            };
          }
        }

        return { data: svc ? config[svc] : config, error: null };
      }

      return { data: {}, error: null };
      } catch (inner) {
        console.error("third-party-config cache callback:", inner);
        return { data: {}, error: null };
      }
    },
    ["third-party-config-public", service, app, tenantId || "global"],
    { revalidate: 3600, tags: ["platform-settings"] }
  )();
}
