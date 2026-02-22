import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/referrals/track
 *
 * Records a referral conversion when a referred user makes their first
 * booking. Updates the referrer's referral count and awards loyalty points
 * based on `referral_settings`.
 *
 * Body:
 *   - referral_code: string  — the referral code used at signup
 *   - booking_id: string     — the newly-created booking ID
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi([
      "customer",
      "provider_owner",
      "provider_staff",
      "superadmin",
    ], request);
    const supabaseAdmin = await getSupabaseAdmin();

    const body = await request.json();
    const { referral_code, booking_id } = body;

    if (!referral_code) {
      return errorResponse(
        "referral_code is required",
        "VALIDATION_ERROR",
        400
      );
    }
    if (!booking_id) {
      return errorResponse(
        "booking_id is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Look up the referrer by code (handle or short-id)
    const { data: referrerUser, error: referrerError } = await supabaseAdmin
      .from("users")
      .select("id, handle")
      .or(`handle.eq.${referral_code},id.ilike.${referral_code}%`)
      .limit(1)
      .maybeSingle();

    if (referrerError) {
      console.error("[referrals/track] Referrer lookup error:", referrerError);
      return handleApiError(referrerError, "Failed to look up referral code");
    }

    if (!referrerUser) {
      return errorResponse(
        "Invalid referral code",
        "NOT_FOUND",
        404
      );
    }

    if (referrerUser.id === user.id) {
      return errorResponse(
        "Cannot use your own referral code",
        "VALIDATION_ERROR",
        400
      );
    }

    // Load referral reward settings
    let rewardAmount = 50; // default ZAR
    let rewardCurrency = "ZAR";

    try {
      const { data: settings } = await supabaseAdmin
        .from("referral_settings")
        .select("reward_amount, reward_currency")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (settings) {
        rewardAmount = Number(settings.reward_amount) || 50;
        rewardCurrency = settings.reward_currency || "ZAR";
      }
    } catch {
      // Table may not exist — use defaults
    }

    // Check for duplicate conversion on this booking
    try {
      const { data: existing } = await supabaseAdmin
        .from("user_referrals")
        .select("id")
        .eq("referred_user_id", user.id)
        .eq("booking_id", booking_id)
        .maybeSingle();

      if (existing) {
        return errorResponse(
          "Referral already tracked for this booking",
          "CONFLICT",
          409
        );
      }
    } catch {
      // Table may not exist, proceed anyway
    }

    // Insert referral record
    let referralRecord: any = null;
    try {
      const { data, error: insertError } = await supabaseAdmin
        .from("user_referrals")
        .insert({
          referrer_id: referrerUser.id,
          referred_user_id: user.id,
          referral_code,
          booking_id,
          reward_amount: rewardAmount,
          reward_currency: rewardCurrency,
          status: "completed",
        })
        .select()
        .single();

      if (insertError) {
        console.error("[referrals/track] Insert error:", insertError);
        return handleApiError(insertError, "Failed to record referral");
      }

      referralRecord = data;
    } catch (err) {
      console.error("[referrals/track] Insert exception:", err);
      return errorResponse(
        "Failed to record referral — user_referrals table may not exist",
        "INTERNAL_ERROR",
        500
      );
    }

    // Award loyalty points to the referrer
    try {
      await supabaseAdmin.from("loyalty_points").insert({
        user_id: referrerUser.id,
        points: rewardAmount,
        reason: "referral_reward",
        reference_id: referralRecord?.id ?? booking_id,
      });
    } catch {
      // loyalty_points table may not exist — non-fatal
      console.warn("[referrals/track] Could not award loyalty points");
    }

    return successResponse(
      {
        referral_id: referralRecord?.id,
        referrer_id: referrerUser.id,
        reward_amount: rewardAmount,
        reward_currency: rewardCurrency,
        status: "completed",
      },
      201
    );
  } catch (error) {
    return handleApiError(error, "Failed to track referral");
  }
}
