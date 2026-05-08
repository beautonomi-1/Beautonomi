import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveReferrerUserId } from "@/lib/referrals/resolve-referrer";
import { bookingQualifiesForReferralReward } from "@/lib/referrals/booking-qualifies-for-referral";

const REFERRAL_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

/**
 * POST /api/me/referrals/track
 *
 * Records a referral conversion when a referred user’s first eligible booking
 * is paid (or confirmed complimentary). Uses referral_settings (single-row).
 * Credits referrer wallet via wallet_credit_admin.
 *
 * Body:
 *   - booking_id: string       — the booking ID (required)
 *   - referral_code?: string   — optional; if omitted, uses current user's referred_by
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabaseAdmin = await getSupabaseAdmin();

    const body = await request.json();
    const { referral_code: codeFromBody, booking_id } = body;

    if (!booking_id) {
      return errorResponse("booking_id is required", "VALIDATION_ERROR", 400);
    }

    const { data: bookingRow, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select("tenant_id, status, payment_status, total_amount")
      .eq("id", booking_id)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (bookingErr) {
      return handleApiError(bookingErr, "Failed to verify booking");
    }
    if (!bookingRow) {
      return errorResponse("Booking not found or does not belong to you", "NOT_FOUND", 404);
    }

    if (!bookingQualifiesForReferralReward(bookingRow as Record<string, unknown>)) {
      return errorResponse(
        "Referral rewards apply after the booking is paid, or once a complimentary booking is confirmed.",
        "BOOKING_NOT_ELIGIBLE",
        400
      );
    }

    const referralMarketTenantId =
      (bookingRow as { tenant_id?: string | null }).tenant_id ?? null;
    const tenantIdForCurrency =
      referralMarketTenantId ?? (await resolveTenantIdWithZaFallback(request));
    const marketCurrencyFallback =
      (await getTenantRegionConfig(tenantIdForCurrency))?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    let rewardAmount = 50;
    let rewardCurrency = marketCurrencyFallback;
    let referralsEnabled = true;
    try {
      const { data: settings } = await supabaseAdmin
        .from("referral_settings")
        .select("referral_amount, referral_currency, is_enabled")
        .eq("id", REFERRAL_SETTINGS_ID)
        .maybeSingle();

      if (settings) {
        referralsEnabled = (settings as { is_enabled?: boolean }).is_enabled !== false;
        rewardAmount = Number((settings as { referral_amount?: unknown }).referral_amount) || 50;
        rewardCurrency =
          (settings as { referral_currency?: string | null }).referral_currency ||
          marketCurrencyFallback;
      }
    } catch {
      // use defaults
    }

    if (!referralsEnabled) {
      return errorResponse(
        "The referral program is not active right now.",
        "REFERRALS_DISABLED",
        400
      );
    }

    let referrerUser: {
      id: string;
      handle?: string | null;
      referral_code?: string | null;
    } | null = null;
    let referralCode: string;

    if (codeFromBody) {
      const referrerIdResolved = await resolveReferrerUserId(supabaseAdmin, String(codeFromBody));
      if (!referrerIdResolved) {
        return errorResponse(
          "Invalid referral code or referrer not found",
          "NOT_FOUND",
          404
        );
      }
      const { data, error: referrerError } = await supabaseAdmin
        .from("users")
        .select("id, handle, referral_code")
        .eq("id", referrerIdResolved)
        .maybeSingle();

      if (referrerError) {
        console.error("[referrals/track] Referrer lookup error:", referrerError);
        return handleApiError(referrerError, "Failed to look up referral code");
      }
      referrerUser = data;
      referralCode =
        (data as { referral_code?: string | null })?.referral_code?.trim() ||
        (data as { handle?: string | null })?.handle ||
        String(codeFromBody);
    } else {
      const { data: me } = await supabaseAdmin
        .from("users")
        .select("referred_by")
        .eq("id", user.id)
        .single();

      if (!(me as { referred_by?: string | null } | null)?.referred_by) {
        return successResponse(
          {
            status: "skipped",
            reason: "no_referral_to_attribute",
          },
          200
        );
      }

      const { data: referrer } = await supabaseAdmin
        .from("users")
        .select("id, handle, referral_code")
        .eq("id", (me as { referred_by: string }).referred_by)
        .single();

      referrerUser = referrer;
      referralCode =
        referrer?.referral_code?.trim() ||
        referrer?.handle ||
        (referrer as { id?: string })?.id?.slice(0, 8) ||
        String((me as { referred_by: string }).referred_by);
    }

    if (!referrerUser) {
      return errorResponse(
        "Invalid referral code or referrer not found",
        "NOT_FOUND",
        404
      );
    }

    if (referrerUser.id === user.id) {
      return errorResponse("Cannot use your own referral code", "VALIDATION_ERROR", 400);
    }

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

    let referralRecord: { id: string } | null = null;
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

      referralRecord = data as { id: string };
    } catch (err) {
      console.error("[referrals/track] Insert exception:", err);
      return errorResponse(
        "Failed to record referral — user_referrals table may not exist",
        "INTERNAL_ERROR",
        500
      );
    }

    const referralWalletTenantId = await resolveTenantIdForFinanceLedger(supabaseAdmin, {
      tenant_id: referralMarketTenantId,
      provider_id: null,
    });

    if (rewardAmount > 0) {
      const { error: walletErr } = await supabaseAdmin.rpc("wallet_credit_admin", {
        p_user_id: referrerUser.id,
        p_amount: rewardAmount,
        p_currency: rewardCurrency,
        p_description: `Referral reward — referred user completed first booking`,
        p_reference_id: referralRecord?.id ?? null,
        p_reference_type: "referral",
        p_tenant_id: referralWalletTenantId,
      });

      if (walletErr) {
        console.error("[referrals/track] wallet_credit_admin failed:", walletErr);
        const { error: delErr } = await supabaseAdmin
          .from("user_referrals")
          .delete()
          .eq("id", referralRecord.id);
        if (delErr) {
          console.error("[referrals/track] Rollback delete failed after wallet error:", delErr);
        }
        return errorResponse(
          "Could not complete referral reward. Please try again in a moment.",
          "WALLET_CREDIT_FAILED",
          503
        );
      }
    }

    if (rewardAmount > 0) {
      try {
        const pointsToAward = Math.round(rewardAmount);
        
        await supabaseAdmin.from("loyalty_point_transactions").insert({
          user_id: referrerUser.id,
          points: pointsToAward,
          transaction_type: "earned",
          description: "Referral reward",
          reference_id: referralRecord?.id ?? null,
          reference_type: "referral",
        });

        const { data: balanceData } = await supabaseAdmin.rpc("get_customer_available_points", { customer_uuid: referrerUser.id });
        const currentBalance = Number(balanceData) || 0;

        await supabaseAdmin.from("loyalty_points_ledger").insert({
          customer_id: referrerUser.id,
          transaction_type: "bonus",
          points_amount: pointsToAward,
          balance_after: currentBalance + pointsToAward,
          description: "Referral reward",
          metadata: { referral_id: referralRecord?.id },
        });
      } catch (loyaltyErr) {
        console.warn("[referrals/track] loyalty point insert:", loyaltyErr);
      }
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
