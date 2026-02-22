import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { z } from "zod";

const bodySchema = z.object({
  set_as_default: z.boolean().optional(),
  callback_url: z.string().url().optional(),
});

/**
 * POST /api/me/payment-methods/initialize-verification
 *
 * Start a small temporary charge (e.g. R1) to verify and save a card without a booking.
 * Customer pays on Paystack; we save the card on charge.success. The small amount can be
 * refunded separately or used as per product policy.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    const { set_as_default, callback_url } = parsed.success ? parsed.data : { set_as_default: false, callback_url: undefined };

    // Get user email (required by Paystack)
    const { data: userRow } = await supabase
      .from("users")
      .select("email")
      .eq("id", user.id)
      .single();
    const email = (userRow as any)?.email ?? (user as any).email;
    if (!email || typeof email !== "string") {
      return errorResponse("Email is required to add a card. Please set your email in account settings.", "VALIDATION_ERROR", 400);
    }

    const currency = "ZAR";
    const amountInCurrency = 1; // R1 (or minimum) for verification
    const amountInSmallestUnit = convertToSmallestUnit(amountInCurrency);
    const reference = generateTransactionReference("card_verify", user.id);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit,
      currency,
      reference,
      callback_url: callback_url || `${baseUrl}/account/settings/payments?card_verified=1`,
      metadata: {
        customer_id: user.id,
        save_card: true,
        set_as_default: set_as_default ?? false,
        kind: "card_verification",
      },
    });

    return successResponse({
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference: paystackData.data.reference,
    });
  } catch (error) {
    return handleApiError(error, "Failed to start card verification");
  }
}
