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

    // Load referral settings from DB so mobile and web get same is_enabled and amount
    const REFERRAL_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";
    let referralSettings = { referral_amount: 50, referral_currency: "ZAR", is_enabled: true };
    try {
      const { data: rs } = await supabase
        .from("referral_settings")
        .select("referral_amount, referral_currency, is_enabled")
        .eq("id", REFERRAL_SETTINGS_ID)
        .maybeSingle();
      if (rs) {
        referralSettings = {
          referral_amount: Number(rs.referral_amount) ?? 50,
          referral_currency: rs.referral_currency || "ZAR",
          is_enabled: rs.is_enabled !== false,
        };
      }
    } catch {
      // use defaults
    }

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
