import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/countries
 * 
 * Get all active countries from iso_countries table
 * Used for dropdowns in forms (e.g., address forms, onboarding)
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return successResponse([]);
    }

    // Fetch active countries from iso_countries table
    const { data, error } = await supabase
      .from("iso_countries")
      .select("code, name, phone_country_code")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      // Handle "relation does not exist" gracefully if migration hasn't run yet
      if (error.code === "42P01" || error.message?.includes("does not exist") || error.code === "PGRST116") {
        console.warn("Table 'iso_countries' may not exist in database, returning empty array");
        return successResponse([]);
      }
      console.error("Error fetching countries:", error);
      // Return empty array instead of error to allow fallback in frontend
      return successResponse([]);
    }

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch countries");
  }
}
