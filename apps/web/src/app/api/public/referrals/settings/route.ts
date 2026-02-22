import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/referrals/settings
 * 
 * Get public referral settings (reward amounts, currency, etc.)
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();

    const { data: referralSettings, error } = await supabase
      .from('referral_settings')
      .select('referral_amount, referral_message, referral_currency, is_enabled')
      .single();

    // Return default if not found
    if (error && error.code === 'PGRST116') {
      return successResponse({
        referral_amount: 50,
        referral_message: 'Join Beautonomi and get rewarded! Use my referral link to get started.',
        referral_currency: 'ZAR',
        is_enabled: true,
      });
    }

    if (error) {
      throw error;
    }

    return successResponse({
      referral_amount: referralSettings?.referral_amount || 50,
      referral_message: referralSettings?.referral_message || 'Join Beautonomi and get rewarded! Use my referral link to get started.',
      referral_currency: referralSettings?.referral_currency || 'ZAR',
      is_enabled: referralSettings?.is_enabled !== false,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch referral settings");
  }
}
