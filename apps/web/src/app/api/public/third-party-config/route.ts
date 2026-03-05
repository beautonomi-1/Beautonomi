import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

/**
 * GET /api/public/third-party-config
 * 
 * Public endpoint to get third-party service configuration (safe keys only)
 * This is cached and doesn't require authentication
 */
export const GET = unstable_cache(
  async (request: Request) => {
    try {
      const { searchParams } = new URL(request.url);
      const service = searchParams.get("service"); // onesignal, mapbox, amplitude, google

      const supabase = await getSupabaseServer();
      const { data: settings } = await (supabase
        .from("platform_settings") as any)
        .select("settings")
        .single();

      if (settings && (settings as any).settings) {
        const config: any = {};

        // OneSignal - return app_id only (safe to expose)
        if (!service || service === "onesignal") {
          if ((settings as any).settings.onesignal?.enabled) {
            config.onesignal = {
              app_id: (settings as any).settings.onesignal.app_id,
              safari_web_id: (settings as any).settings.onesignal.safari_web_id,
              enabled: true,
            };
          }
        }

        // Mapbox - single source for web + mobile: prefer mapbox_config (Admin > Mapbox); fallback to platform_settings
        if (!service || service === "mapbox") {
          const { data: mapboxConfigRow } = await (supabase
            .from("mapbox_config") as any)
            .select("public_access_token, style_url, is_enabled")
            .eq("is_enabled", true)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (mapboxConfigRow?.public_access_token) {
            config.mapbox = {
              public_token: mapboxConfigRow.public_access_token,
              style_url: mapboxConfigRow.style_url ?? undefined,
              enabled: true,
            };
          } else if ((settings as any).settings.mapbox?.enabled && (settings as any).settings.mapbox?.public_token) {
            config.mapbox = {
              public_token: (settings as any).settings.mapbox.public_token,
              enabled: true,
            };
          }
        }

        // Amplitude - return API key only (safe to expose)
        if (!service || service === "amplitude") {
          if ((settings as any).settings.amplitude?.enabled) {
            config.amplitude = {
              api_key: (settings as any).settings.amplitude.api_key,
              enabled: true,
            };
          }
        }

        // Google - return public keys only
        if (!service || service === "google") {
          if ((settings as any).settings.google?.enabled) {
            config.google = {
              maps_api_key: (settings as any).settings.google.maps_api_key,
              places_api_key: (settings as any).settings.google.places_api_key,
              analytics_id: (settings as any).settings.google.analytics_id,
              enabled: true,
            };
          }
        }

        return NextResponse.json({
          data: service ? config[service] : config,
          error: null,
        });
      }

      // Fallback
      return NextResponse.json({
        data: {},
        error: null,
      });
    } catch (error) {
      console.error("Error fetching third-party config:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch third-party configuration",
            code: "INTERNAL_ERROR",
          },
        },
        { status: 500 }
      );
    }
  },
  ["third-party-config-public"],
  {
    revalidate: 3600, // Revalidate every hour
    tags: ["platform-settings"],
  }
);
