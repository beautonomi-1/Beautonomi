import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/public/directions-config
 * 
 * Returns the directions/map provider configuration.
 * This is a public endpoint that returns non-sensitive configuration.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    // Fetch Mapbox config (public fields only)
    const { data: mapboxConfig, error } = await supabase
      .from("mapbox_config")
      .select("public_access_token, is_enabled")
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found, which is okay
      console.error("Error fetching Mapbox config:", error);
    }

    // Determine the provider based on configuration
    let provider: "mapbox" | "google" = "google";
    let mapboxPublicToken: string | undefined;

    if (mapboxConfig?.is_enabled && mapboxConfig?.public_access_token) {
      provider = "mapbox";
      mapboxPublicToken = mapboxConfig.public_access_token;
    }

    return NextResponse.json({
      data: {
        provider,
        mapboxPublicToken,
      },
      error: null,
    });
  } catch (error) {
    console.error("Error in /api/public/directions-config:", error);
    
    // Return a safe default on error
    return NextResponse.json({
      data: {
        provider: "google",
      },
      error: null,
    });
  }
}
