import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/previous-software-options
 * 
 * Get all active previous software options for provider onboarding
 * Used to populate the dropdown in the onboarding form
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return successResponse([]);
    }

    // Fetch active previous software options
    const { data, error } = await supabase
      .from("previous_software_options")
      .select("id, name, slug, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      // Handle "relation does not exist" gracefully if migration hasn't run yet
      if (error.code === "42P01" || error.message?.includes("does not exist") || error.code === "PGRST116") {
        console.warn("Table 'previous_software_options' may not exist in database, returning empty array");
        return successResponse([]);
      }
      console.error("Error fetching previous software options:", error);
      // Return empty array instead of error to allow fallback in frontend
      return successResponse([]);
    }

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch previous software options");
  }
}
