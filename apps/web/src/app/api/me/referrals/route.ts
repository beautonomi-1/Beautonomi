import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/referrals
 * 
 * Get current user's referral stats and code
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();

    // Get user profile to find referral code (handle or id)
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, handle")
      .eq("id", user.id)
      .single();

    if (userError) throw userError;

    // Generate referral code from handle or user ID
    const referralCode = userData?.handle || userData?.id?.slice(0, 8).toUpperCase() || "BEAUTY";

    // Get referral stats from user_referrals table (if it exists)
    const stats = {
      total_referrals: 0,
      successful_referrals: 0,
      total_earnings: 0,
      pending_earnings: 0,
    };

    try {
      const { data: referrals, error: referralsError } = await supabase
        .from("user_referrals")
        .select("id, status, reward_amount, created_at")
        .eq("referrer_id", user.id);

      if (!referralsError && referrals) {
        stats.total_referrals = referrals.length;
        stats.successful_referrals = referrals.filter(r => r.status === "completed").length;
        stats.total_earnings = referrals
          .filter(r => r.status === "completed")
          .reduce((sum, r) => sum + (Number(r.reward_amount) || 0), 0);
        stats.pending_earnings = referrals
          .filter(r => r.status === "pending")
          .reduce((sum, r) => sum + (Number(r.reward_amount) || 0), 0);
      }
    } catch {
      // Table might not exist yet, use defaults
      console.warn("user_referrals table not found, using default stats");
    }

    // Get referral settings (public endpoint would be better, but using defaults for now)
    const referralSettings = {
      referral_amount: 50,
      referral_currency: "ZAR",
      is_enabled: true,
    };

    // Generate referral link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const referralLink = `${baseUrl}/signup?ref=${referralCode}`;

    return successResponse({
      referral_code: referralCode,
      referral_link: referralLink,
      stats,
      settings: referralSettings,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch referral data");
  }
}
