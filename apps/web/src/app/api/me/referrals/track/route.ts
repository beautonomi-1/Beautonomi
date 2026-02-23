import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

const REFERRAL_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

/**
 * POST /api/me/referrals/track
 *
 * Records a referral conversion when a referred user makes their first
 * booking. Uses referral_settings (single-row). Awards loyalty points to referrer.
 *
 * Body:
 *   - booking_id: string       — the newly-created booking ID (required)
 *   - referral_code?: string   — optional; if omitted, uses current user's referred_by
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
    const { referral_code: codeFromBody, booking_id } = body;

    if (!booking_id) {
      return errorResponse(
        "booking_id is required",
        "VALIDATION_ERROR",
        400
      );
    }

    let referrerUser: { id: string; handle: string } | null = null;
    let referralCode: string;

    if (codeFromBody) {
      // Look up referrer by code (handle or short-id)
      const { data, error: referrerError } = await supabaseAdmin
        .from("users")
        .select("id, handle")
        .or(`handle.eq.${codeFromBody},id.ilike.${codeFromBody}%`)
        .limit(1)
        .maybeSingle();

      if (referrerError) {
        console.error("[referrals/track] Referrer lookup error:", referrerError);
        return handleApiError(referrerError, "Failed to look up referral code");
      }
      referrerUser = data;
      referralCode = codeFromBody;
    } else {
      // Use current user's referred_by (set at signup via ref=)
      const { data: me } = await supabaseAdmin
        .from("users")
        .select("referred_by")
        .eq("id", user.id)
        .single();

      if (!me?.referred_by) {
        return errorResponse(
          "No referral to attribute. Use referral_code or sign up with a referral link.",
          "VALIDATION_ERROR",
          400
        );
      }

      const { data: referrer } = await supabaseAdmin
        .from("users")
        .select("id, handle")
        .eq("id", (me as any).referred_by)
        .single();

      referrerUser = referrer;
      referralCode = referrer?.handle || (referrer as any)?.id?.slice(0, 8) || String((me as any).referred_by);
    }

    if (!referrerUser) {
      return errorResponse(
        "Invalid referral code or referrer not found",
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

    // Load referral reward settings (single-row table; column is referral_amount not reward_amount)
    let rewardAmount = 50;
    let rewardCurrency = "ZAR";
    try {
      const { data: settings } = await supabaseAdmin
        .from("referral_settings")
        .select("referral_amount, referral_currency")
        .eq("id", REFERRAL_SETTINGS_ID)
        .maybeSingle();

      if (settings) {
        rewardAmount = Number((settings as any).referral_amount) || 50;
        rewardCurrency = (settings as any).referral_currency || "ZAR";
      }
    } catch {
      // use defaults
    }

    // Uniqueness: one reward per referred user (first booking only). No double-credit on later bookings.
    try {
      const { data: existingForUser } = await supabaseAdmin
        .from("user_referrals")
        .select("id")
        .eq("referred_user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (existingForUser) {
        return successResponse(
          { referral_id: existingForUser.id, status: "already_converted" },
          200
        );
      }
    } catch {
      // proceed
    }

    // Optional: same booking already tracked (idempotent)
    try {
      const { data: existingForBooking } = await supabaseAdmin
        .from("user_referrals")
        .select("id")
        .eq("referred_user_id", user.id)
        .eq("booking_id", booking_id)
        .maybeSingle();
      if (existingForBooking) {
        return successResponse(
          { referral_id: existingForBooking.id, status: "already_tracked" },
          200
        );
      }
    } catch {
      // proceed
    }

    // Insert referral record (booking_id column added in migration 241)
    let referralRecord: any = null;
    try {
      const { data, error: insertError } = await supabaseAdmin
        .from("user_referrals")
        .insert({
          referrer_id: referrerUser.id,
          referred_user_id: user.id,
          referral_code: referralCode,
          booking_id: booking_id,
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

    // Credit referrer's wallet (platform pays this; see revenue impact in admin referral settings)
    try {
      await supabaseAdmin.rpc("wallet_credit_admin", {
        p_user_id: referrerUser.id,
        p_amount: rewardAmount,
        p_currency: rewardCurrency,
        p_description: `Referral reward — referred user completed first booking`,
        p_reference_id: referralRecord?.id ?? null,
        p_reference_type: "referral",
      });
    } catch (walletErr) {
      console.warn("[referrals/track] Could not credit wallet:", walletErr);
    }

    // Optional: record in loyalty_point_transactions for audit (points = reward amount)
    try {
      await supabaseAdmin.from("loyalty_point_transactions").insert({
        user_id: referrerUser.id,
        points: Math.round(rewardAmount),
        transaction_type: "earned",
        description: "Referral reward",
        reference_id: referralRecord?.id ?? null,
        reference_type: "referral",
      });
    } catch {
      // Non-fatal
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
