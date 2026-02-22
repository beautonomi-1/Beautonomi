import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, badRequestResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validatePromoCode } from "@/lib/promotions/validate";

/**
 * POST /api/public/promotions/validate
 *
 * Validates a promo code scoped to a provider and returns discount information.
 *
 * Request body:
 * {
 *   code: string;
 *   provider_id: string;
 *   booking_amount: number; // Subtotal before discount
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { code, provider_id, booking_amount } = body;

    if (!code || !provider_id || booking_amount === undefined) {
      return badRequestResponse("Missing required fields: code, provider_id, booking_amount");
    }

    const result = await validatePromoCode(supabase, {
      code,
      amount: booking_amount,
      providerId: provider_id,
    });

    if (!result.valid) {
      return badRequestResponse(result.message || "Invalid promo code");
    }

    return successResponse({
      valid: true,
      promotion: result.promotion,
      discount: result.discount,
    });
  } catch (error) {
    return handleApiError(error, "Failed to validate promo code");
  }
}
