import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/languages
 *
 * Returns active languages from iso_languages (same source as Admin ISO Codes).
 * Used for i18n language selector and platform-supported languages.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return successResponse([]);
    }

    const { data, error } = await supabase
      .from("iso_languages")
      .select("code, name, native_name, is_default, rtl")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist") || error.code === "PGRST116") {
        return successResponse([]);
      }
      console.error("Error fetching languages:", error);
      return successResponse([]);
    }

    const list = (data || []).map((row) => ({
      code: row.code,
      name: row.name,
      nativeName: row.native_name ?? row.name,
      isDefault: Boolean(row.is_default),
      rtl: Boolean(row.rtl),
    }));

    return successResponse(list);
  } catch {
    return successResponse([]);
  }
}
