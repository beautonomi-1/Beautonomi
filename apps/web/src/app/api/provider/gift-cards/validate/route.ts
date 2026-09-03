import { NextRequest } from "next/server";
import { successResponse, errorResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { isGiftCardsEnabledForTenant } from "@/lib/subscriptions/entitlements";
import { createClient } from "@supabase/supabase-js";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { checkGiftCardValidateRateLimit } from "@/lib/rate-limit/gift-card-validate";

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

    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabaseAdmin);
    let flagTenantId: string | null = null;
    if (providerId) {
      const { data: prow } = await supabaseAdmin
        .from("providers")
        .select("tenant_id")
        .eq("id", providerId)
        .maybeSingle();
      flagTenantId = (prow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    }

    const giftCardsEnabled = await isGiftCardsEnabledForTenant(flagTenantId);
    if (!giftCardsEnabled) {
      return errorResponse("Gift cards are currently unavailable.", "FEATURE_DISABLED", 403);
    }

    const tenantForCurrency = flagTenantId ?? (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(tenantForCurrency);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code || !code.trim()) {
      return errorResponse("Gift card code is required", "VALIDATION_ERROR", 400);
    }

    const rateLimit = await checkGiftCardValidateRateLimit(request, permissionCheck.user.id);
    if (!rateLimit.allowed) {
      return errorResponse(
        "Too many validation attempts. Please try again later.",
        "RATE_LIMITED",
        429,
      );
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
        currency: giftCard.currency || lastResortCurrency,
        initial_balance: Number(giftCard.initial_balance || 0),
        balance: balance,
        expires_at: giftCard.expires_at,
      },
      balance: balance,
      message: `Gift card balance: ${giftCard.currency || lastResortCurrency} ${balance.toFixed(2)}`,
    });
  } catch (error) {
    return handleApiError(error, "Failed to validate gift card");
  }
}
