import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse } from "@/lib/supabase/api-helpers";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase
      .from('about_us_content')
      .select('section_key, title, content')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      // If table doesn't exist yet, return empty array
      if (error.code === '42P01') {
        return successResponse([]);
      }
      throw error;
    }

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch about us content");
  }
}
