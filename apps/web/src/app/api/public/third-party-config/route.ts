import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

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

  try {
    const result = await getCachedThirdPartyConfig(service, app);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching third-party config:", error);
    return NextResponse.json(
      {
        data: null,
        error: { message: "Failed to fetch third-party configuration", code: "INTERNAL_ERROR" },
      },
      { status: 500 }
    );
  }
}

async function getCachedThirdPartyConfig(service: string, app: string) {
  return unstable_cache(
    async () => {
      const supabase = await getSupabaseServer();
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("settings")
        .single();

      type SettingsRow = { settings?: { onesignal?: { enabled?: boolean; app_id?: string; app_id_provider?: string; safari_web_id?: string }; mapbox?: { enabled?: boolean; public_token?: string }; amplitude?: { enabled?: boolean; api_key?: string }; google?: { enabled?: boolean; maps_api_key?: string; places_api_key?: string; analytics_id?: string } } };
      const s = settings as SettingsRow | null;
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
          const { data: mapboxConfigRow } = await supabase
            .from("mapbox_config")
            .select("public_access_token, style_url, is_enabled")
            .eq("is_enabled", true)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

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
    },
    ["third-party-config-public", service, app],
    { revalidate: 3600, tags: ["platform-settings"] }
  )();
}
