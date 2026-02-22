import { NextRequest } from "next/server";
import { successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/provider/gift-cards/validate
 *
 * Validate a gift card code and return current balance.
 * Gift cards are platform-wide (no provider_id on gift_cards table) - any provider
 * can validate and redeem any valid gift card. Access is controlled by requirePermission('view_sales', request).
 *
 * Query params:
 * - code: Gift card code to validate
 */
export async function GET(request: NextRequest) {
  try {
    // Check permission to view sales (needed to validate gift cards for sales)
    const permissionCheck = await requirePermission('view_sales', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code || !code.trim()) {
      return errorResponse("Gift card code is required", "VALIDATION_ERROR", 400);
    }

    const giftCardCode = code.trim().toUpperCase();

    // Get gift card by code
    const { data: giftCard, error: giftCardError } = await supabaseAdmin
      .from('gift_cards')
      .select('*')
      .eq('code', giftCardCode)
      .single();

    if (giftCardError || !giftCard) {
      return errorResponse("Invalid gift card code", "INVALID_GIFT_CARD", 404);
    }

    // Validate gift card is active
    if (!giftCard.is_active) {
      return errorResponse("This gift card is no longer active", "GIFT_CARD_INACTIVE", 400);
    }

    // Validate expiry date
    if (giftCard.expires_at && new Date(giftCard.expires_at) < new Date()) {
      return errorResponse("This gift card has expired", "GIFT_CARD_EXPIRED", 400);
    }

    // Check balance
    const balance = Number(giftCard.balance || 0);
    if (balance <= 0) {
      return errorResponse("This gift card has no remaining balance", "GIFT_CARD_ZERO_BALANCE", 400);
    }

    return successResponse({
      valid: true,
      gift_card: {
        id: giftCard.id,
        code: giftCard.code,
        currency: giftCard.currency || 'ZAR',
        initial_balance: Number(giftCard.initial_balance || 0),
        balance: balance,
        expires_at: giftCard.expires_at,
      },
      balance: balance,
      message: `Gift card balance: ${giftCard.currency || 'ZAR'} ${balance.toFixed(2)}`,
    });
  } catch (error) {
    return handleApiError(error, "Failed to validate gift card");
  }
}
