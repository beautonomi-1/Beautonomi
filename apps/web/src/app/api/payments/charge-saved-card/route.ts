import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { chargeAuthorization, convertToSmallestUnit } from "@/lib/payments/paystack-complete";
import { z } from "zod";

const chargeSavedCardSchema = z.object({
  payment_method_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().optional().default("ZAR"),
  email: z.string().email(),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * POST /api/payments/charge-saved-card
 * 
 * Charge a saved Paystack card using authorization code
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin']);

    const body = chargeSavedCardSchema.parse(await request.json());

    const supabase = await getSupabaseServer();

    // Get the payment method
    const { data: paymentMethod, error: pmError } = await (supabase
      .from("payment_methods") as any)
      .select("*")
      .eq("id", body.payment_method_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("provider", "paystack")
      .single();

    if (pmError || !paymentMethod) {
      return handleApiError(
        new Error("Payment method not found or invalid"),
        "Payment method not found",
        "NOT_FOUND",
        404
      );
    }

    // Verify the payment method belongs to the user
    if (paymentMethod.user_id !== user.id) {
      return handleApiError(
        new Error("Unauthorized"),
        "You don't have permission to use this payment method",
        "UNAUTHORIZED",
        403
      );
    }

    // Get authorization code
    const authorizationCode = paymentMethod.provider_payment_method_id;

    if (!authorizationCode || !authorizationCode.startsWith("AUTH_")) {
      return handleApiError(
        new Error("Invalid payment method"),
        "This payment method is not a valid Paystack authorization",
        "INVALID_METHOD",
        400
      );
    }

    // Charge the card
    const amountInSmallestUnit = convertToSmallestUnit(body.amount);

    const chargeResult = await chargeAuthorization(
      authorizationCode,
      body.email,
      amountInSmallestUnit,
      {
        ...body.metadata,
        payment_method_id: body.payment_method_id,
        user_id: user.id,
      }
    );

    if (!chargeResult.status) {
      return handleApiError(
        new Error(chargeResult.message || "Charge failed"),
        "Failed to charge card",
        "CHARGE_FAILED",
        400
      );
    }

    return successResponse({
      transaction: chargeResult.data,
      reference: chargeResult.data.reference,
      status: chargeResult.data.status,
      message: chargeResult.message,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to charge saved card");
  }
}
