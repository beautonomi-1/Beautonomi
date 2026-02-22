import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/referrals/faqs
 * 
 * Get active referral FAQs for public display
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase
      .from("referral_faqs")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      // If table doesn't exist, return empty array (graceful degradation)
      if (error.code === "42P01") {
        return successResponse([]);
      }
      throw error;
    }

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch referral FAQs");
  }
}
