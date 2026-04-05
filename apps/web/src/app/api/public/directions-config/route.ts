import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";

/**
 * GET /api/public/directions-config
 * 
 * Returns the directions/map provider configuration.
 * This is a public endpoint that returns non-sensitive configuration.
 */
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const tenant = await resolveTenantFromRequest(request);
    const tenantId = tenant?.id ?? null;

    let mapboxConfig: { public_access_token?: string | null; is_enabled?: boolean | null; style_url?: string | null } | null = null;
    let error: { code?: string } | null = null;
    if (tenantId) {
      const tenantRes = await supabase
        .from("mapbox_config")
        .select("public_access_token, is_enabled, style_url")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      mapboxConfig = tenantRes.data as typeof mapboxConfig;
      error = tenantRes.error as typeof error;
    }
    if (!mapboxConfig) {
      const globalRes = await supabase
        .from("mapbox_config")
        .select("public_access_token, is_enabled, style_url")
        .is("tenant_id", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      mapboxConfig = globalRes.data as typeof mapboxConfig;
      error = (error ?? globalRes.error) as typeof error;
    }

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching Mapbox config:", error);
    }

    const envPublic = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || undefined;

    let provider: "mapbox" | "google" = "google";
    let mapboxPublicToken: string | undefined;
    let mapboxStyleUrl: string | undefined;

    const row = mapboxConfig;
    /** Admin turned Mapbox off — do not expose any public token (including env). */
    const explicitlyDisabled = Boolean(row && row.is_enabled === false);

    if (explicitlyDisabled) {
      provider = "google";
    } else {
      const fromDb = row?.public_access_token?.trim();
      const token = fromDb || envPublic;
      if (token) {
        provider = "mapbox";
        mapboxPublicToken = token;
        mapboxStyleUrl = row?.style_url?.trim() || undefined;
      }
    }

    return NextResponse.json({
      data: {
        provider,
        mapboxPublicToken,
        mapboxStyleUrl,
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
