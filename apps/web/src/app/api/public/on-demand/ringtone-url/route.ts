import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "app-assets";
const DEFAULT_EXPIRY_SEC = 300; // 5 minutes

/**
 * GET /api/public/on-demand/ringtone-url
 * Returns a short-lived signed URL for the on-demand ringtone asset.
 * Query: environment (production|staging|development). Default: production.
 * Config is read from on_demand_module_config; path from ringtone_asset_path.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const environment =
      (searchParams.get("environment") as "production" | "staging" | "development") ??
      "production";
    const expirySec = Math.min(
      3600,
      Math.max(60, parseInt(searchParams.get("expires_in") ?? String(DEFAULT_EXPIRY_SEC), 10) || DEFAULT_EXPIRY_SEC)
    );

    const supabase = getSupabaseAdmin();

    const { data: row, error: configError } = await supabase
      .from("on_demand_module_config")
      .select("ringtone_asset_path")
      .eq("environment", environment)
      .maybeSingle();

    if (configError) {
      console.error("on_demand_module_config read error:", configError);
      return NextResponse.json(
        { error: "Failed to read on-demand config" },
        { status: 500 }
      );
    }

    const path = (row?.ringtone_asset_path as string)?.trim() || null;
    if (!path) {
      return NextResponse.json(
        { error: "No ringtone path configured for this environment" },
        { status: 404 }
      );
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expirySec);

    if (signError) {
      if (
        signError.message?.includes("Bucket not found") ||
        signError.message?.includes("not found") ||
        signError.message?.includes("The resource was not found")
      ) {
        return NextResponse.json(
          {
            error: "Ringtone asset not found",
            message: "The app-assets bucket or file path is not configured.",
          },
          { status: 404 }
        );
      }
      console.error("Storage createSignedUrl error:", signError);
      return NextResponse.json(
        { error: "Failed to generate ringtone URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      signed_url: signed.signedUrl,
      expires_in_seconds: expirySec,
      path,
    });
  } catch (error) {
    console.error("Ringtone URL error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
