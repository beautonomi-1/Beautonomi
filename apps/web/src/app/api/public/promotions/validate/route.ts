import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, badRequestResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validatePromoCode } from "@/lib/promotions/validate";
import { z } from "zod";

const validateBodySchema = z.object({
  code: z.string().min(1, "Promo code is required"),
  provider_id: z.string().uuid("Invalid provider ID"),
  booking_amount: z.number().min(0, "Booking amount must be non-negative"),
});

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

    const parsed = validateBodySchema.safeParse(body);
    if (!parsed.success) {
      return badRequestResponse(
        parsed.error.issues.map((i) => i.message).join("; ") || "Validation failed"
      );
    }

    const { code, provider_id, booking_amount } = parsed.data;

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
