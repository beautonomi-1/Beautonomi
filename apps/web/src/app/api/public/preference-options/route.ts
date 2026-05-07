import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { getTenantScopedCurrencyPreferenceOptions } from "@/lib/preferences/tenant-currency-options";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // 'language', 'currency', or 'timezone'

    if (type === "currency") {
      const rows = await getTenantScopedCurrencyPreferenceOptions(request);
      return successResponse(rows);
    }

    const supabase = await getSupabaseServer();

    let query = supabase
      .from('preference_options')
      .select('id, type, code, name, display_order, metadata')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      // Handle "relation does not exist" gracefully if migration hasn't run yet
      if (error.code === '42P01') {
        console.warn("Table 'preference_options' does not exist. Returning empty array.");
        return successResponse([]);
      }
      throw error;
    }

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch preference options");
  }
}
