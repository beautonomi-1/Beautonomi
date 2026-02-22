import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/profile-questions
 * Get active profile questions for public use (frontend)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section"); // Optional filter by section

    let query = supabase
      .from("profile_questions")
      .select("*")
      .eq("is_active", true)
      .order("section", { ascending: true })
      .order("display_order", { ascending: true });

    if (section) {
      query = query.eq("section", section);
    }

    const { data: questions, error } = await query;

    if (error) {
      // Gracefully handle if table doesn't exist yet
      if (error.code === '42P01') {
        return successResponse([]);
      }
      throw error;
    }

    return successResponse(questions || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch profile questions");
  }
}
