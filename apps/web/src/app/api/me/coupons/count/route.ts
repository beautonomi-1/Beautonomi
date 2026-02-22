import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();

    // Count active coupons for the user
    const { count, error } = await supabase
      .from('user_coupons')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (error) {
      // If table doesn't exist, return 0
      if (error.code === '42P01') {
        return successResponse({ count: 0 });
      }
      throw error;
    }

    return successResponse({ count: count || 0 });
  } catch (error) {
    return handleApiError(error, "Failed to load coupon count");
  }
}
