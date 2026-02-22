import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse } from "@/lib/supabase/api-helpers";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase
      .from('footer_settings')
      .select('key, value')
      .order('key', { ascending: true });

    if (error) {
      // If table doesn't exist yet, return empty object
      if (error.code === '42P01') {
        return successResponse({});
      }
      throw error;
    }

    // Convert array to object for easier access
    const settings = (data || []).reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, string>);

    return successResponse(settings);
  } catch (error) {
    return handleApiError(error, "Failed to fetch footer settings");
  }
}
