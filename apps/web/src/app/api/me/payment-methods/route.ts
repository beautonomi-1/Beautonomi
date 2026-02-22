import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const addCardSchema = z.object({
  card_number: z.string().min(12).max(19),
  expiry_month: z.number().int().min(1).max(12),
  expiry_year: z.number().int().min(2020).max(2100),
  cvv: z.string().optional(),
  cardholder_name: z.string().min(1).max(120),
  billing_address: z.any().optional(),
  is_default: z.boolean().optional(),
});

/**
 * GET /api/me/payment-methods
 * 
 * Get user's payment methods
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer();

    const { data: methods, error } = await supabase
      .from("payment_methods")
      .select("id, type, provider, last_four, expiry_month, expiry_year, card_brand, is_default, is_active, metadata, created_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Backwards-compatible shape for existing UI (card_type/last4/cardholder_name)
    const shaped = (methods || []).map((m: any) => ({
      id: m.id,
      type: m.type,
      provider: m.provider || undefined, // Include provider to identify Paystack cards
      card_type: m.card_brand || undefined,
      last4: m.last_four || undefined,
      expiry_month: m.expiry_month || undefined,
      expiry_year: m.expiry_year || undefined,
      cardholder_name: m.metadata?.cardholder_name || undefined,
      is_default: m.is_default,
      is_active: m.is_active,
      created_at: m.created_at,
    }));

    return successResponse(shaped);
  } catch (error) {
    return handleApiError(error, "Failed to fetch payment methods");
  }
}

/**
 * POST /api/me/payment-methods
 * 
 * Add a new payment method
 * 
 * NOTE: Cards are saved automatically via Paystack when you make a payment.
 * This endpoint is kept for backward compatibility but cards should be saved
 * through the Paystack payment flow with the "save_card" option.
 * 
 * To save a card:
 * 1. Make a payment via Paystack
 * 2. Include "save_card: true" in the payment metadata
 * 3. Paystack will return an authorization_code
 * 4. The webhook will automatically save the card
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const _body = addCardSchema.parse(await request.json());

    // Cards should be saved via Paystack payment flow, not manually
    // This endpoint is deprecated for card saving
    return handleApiError(
      new Error("Cards must be saved through Paystack payment flow. Make a payment with 'save_card: true' option."),
      "Card saving via manual entry is not supported. Please save your card during checkout.",
      "DEPRECATED_METHOD",
      400
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(new Error(error.issues.map((e: any) => e.message).join(", ")), "Validation failed", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to add payment method");
  }
}

/**
 * DELETE /api/me/payment-methods
 * 
 * Remove a payment method (id should be in request body)
 */
export async function DELETE(
  request: NextRequest
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer();
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return handleApiError(
        new Error("Payment method id is required"),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    const { error } = await (supabase
      .from("payment_methods") as any)
      .update({ is_active: false })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to remove payment method");
  }
}

function _getCardType(cardNumber: string): string {
  const number = cardNumber.replace(/\s/g, "");
  if (/^4/.test(number)) return "visa";
  if (/^5[1-5]/.test(number)) return "mastercard";
  if (/^3[47]/.test(number)) return "amex";
  if (/^6(?:011|5)/.test(number)) return "discover";
  return "unknown";
}
