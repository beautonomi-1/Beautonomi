import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/app-store-url
 * 
 * Get the active iOS and Android app store URLs (public endpoint, no auth required)
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();

    // Get both iOS and Android app links
    const [iosResult, androidResult] = await Promise.all([
      supabase
        .from("footer_app_links")
        .select("href")
        .eq("platform", "ios")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(1)
        .single(),
      supabase
        .from("footer_app_links")
        .select("href")
        .eq("platform", "android")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(1)
        .single(),
    ]);

    return successResponse({
      ios: iosResult.data?.href || null,
      android: androidResult.data?.href || null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load app store URLs");
  }
}
