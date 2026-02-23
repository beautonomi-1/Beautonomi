import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/referrals/attach
 *
 * Attach the current user to a referrer (e.g. after signup with ?ref=CODE).
 * Sets users.referred_by for the current user. Idempotent; only sets if not already set.
 *
 * Body: { referral_code: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    const body = await request.json();
    const referral_code =
      typeof body?.referral_code === "string" ? body.referral_code.trim() : null;

    if (!referral_code) {
      return errorResponse(
        "referral_code is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Resolve code to referrer user id
    const { data: referrer, error: lookupError } = await supabase
      .from("users")
      .select("id")
      .or(`handle.eq.${referral_code},id.eq.${referral_code}`)
      .limit(1)
      .maybeSingle();

    if (lookupError || !referrer) {
      return errorResponse(
        "Invalid referral code",
        "NOT_FOUND",
        404
      );
    }

    const referrerId = (referrer as { id: string }).id;
    if (referrerId === user.id) {
      return errorResponse(
        "Cannot attach your own referral code",
        "VALIDATION_ERROR",
        400
      );
    }

    // Only set referred_by if not already set (first signup attribution wins)
    const { data: current } = await supabase
      .from("users")
      .select("referred_by")
      .eq("id", user.id)
      .single();

    if ((current as any)?.referred_by) {
      return successResponse({ attached: false, message: "Already referred" });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ referred_by: referrerId })
      .eq("id", user.id);

    if (updateError) {
      return handleApiError(updateError, "Failed to attach referral");
    }

    return successResponse({ attached: true, referrer_id: referrerId });
  } catch (error) {
    return handleApiError(error, "Failed to attach referral");
  }
}
