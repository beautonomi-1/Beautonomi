import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 300; // 5 minutes

/**
 * Public endpoint to get Amplitude analytics configuration
 * Returns safe config (no server keys) for client-side SDK initialization
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const environment = searchParams.get("environment") || "production";

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("amplitude_integration_config")
      .select("api_key_public, environment, enabled_client_portal, enabled_provider_portal, enabled_admin_portal, guides_enabled, surveys_enabled, sampling_rate, debug_mode")
      .eq("environment", environment)
      .maybeSingle();

    if (error) {
      console.error("Error fetching Amplitude config:", error);
      // Return empty config if error (SDK won't initialize)
      return NextResponse.json({
        api_key_public: null,
        environment: environment,
        enabled_client_portal: false,
        enabled_provider_portal: false,
        enabled_admin_portal: false,
        guides_enabled: false,
        surveys_enabled: false,
        sampling_rate: 1.0,
        debug_mode: false,
      });
    }

    if (!data) {
      // No config found for this environment
      return NextResponse.json({
        api_key_public: null,
        environment: environment,
        enabled_client_portal: false,
        enabled_provider_portal: false,
        enabled_admin_portal: false,
        guides_enabled: false,
        surveys_enabled: false,
        sampling_rate: 1.0,
        debug_mode: false,
      });
    }

    // Return safe config (no server keys) - pick only allowed fields to prevent leaks
    const safeConfig = {
      api_key_public: data.api_key_public,
      environment: data.environment,
      enabled_client_portal: data.enabled_client_portal,
      enabled_provider_portal: data.enabled_provider_portal,
      enabled_admin_portal: data.enabled_admin_portal,
      guides_enabled: data.guides_enabled,
      surveys_enabled: data.surveys_enabled,
      sampling_rate: data.sampling_rate,
      debug_mode: data.debug_mode,
    };
    return NextResponse.json(safeConfig, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error: any) {
    console.error("Error in analytics-config endpoint:", error);
    // Return safe defaults on error
    return NextResponse.json({
      api_key_public: null,
      environment: "production",
      enabled_client_portal: false,
      enabled_provider_portal: false,
      enabled_admin_portal: false,
      guides_enabled: false,
      surveys_enabled: false,
      sampling_rate: 1.0,
      debug_mode: false,
    });
  }
}
