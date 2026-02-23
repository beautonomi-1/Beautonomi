import { NextRequest } from "next/server";
import { successResponse, handleApiError, errorResponse, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { z } from "zod";

const initializeSchema = z.object({
  email: z.string().email("Invalid email address"),
  amount: z.number().min(100, "Minimum amount is 100"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/paystack/initialize
 * 
 * Initialize Paystack payment.
 * Accepts arbitrary metadata including save_card, booking IDs, etc.
 */
export async function POST(request: NextRequest) {
  try {
    const paystackEnabled = await isFeatureEnabledServer("payment_paystack");
    if (!paystackEnabled) {
      return errorResponse(
        "Online card payment is currently unavailable.",
        "FEATURE_DISABLED",
        403
      );
    }

    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const body = initializeSchema.parse(await request.json());
    
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    
    if (!PAYSTACK_SECRET_KEY) {
      throw new Error("Paystack secret key not configured");
    }

    const rawMeta = body.metadata || {};
    const saveCard = rawMeta.saveCard === "true" || rawMeta.saveCard === true;
    const setAsDefault = rawMeta.setAsDefault === "true" || rawMeta.setAsDefault === true;

    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: body.email,
        amount: body.amount,
        metadata: {
          ...rawMeta,
          save_card: saveCard,
          set_as_default: setAsDefault,
          customer_id: user.id,
          custom_fields: [
            ...(rawMeta.bookingId ? [{
              display_name: "Booking ID",
              variable_name: "booking_id",
              value: rawMeta.bookingId,
            }] : []),
          ],
        },
        callback_url: rawMeta.type === "product_order"
          ? `${process.env.NEXT_PUBLIC_APP_URL}/shop/payment-callback`
          : `${process.env.NEXT_PUBLIC_APP_URL}/booking/callback`,
      }),
    });

    if (!paystackResponse.ok) {
      const error = await paystackResponse.json();
      throw new Error(error.message || "Failed to initialize payment");
    }

    const data = await paystackResponse.json();

    return successResponse({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to initialize payment");
  }
}
