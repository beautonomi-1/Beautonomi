import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { getPaymentFeatureFlagsForTenant } from "@/lib/subscriptions/entitlements";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { checkPublicMutationRateLimit } from "@/lib/rate-limit/public-mutation";
import { multiplyMoney } from "@beautonomi/utils";

const purchaseSchema = z.object({
  amount: z.number().positive(),
  quantity: z.number().int().positive().min(1).max(1000).default(1),
  currency: z.string().min(3).max(6).optional(),
  recipient_email: z.string().email().optional().nullable(),
  // provider_id removed - platform sells all gift cards
});

/**
 * POST /api/public/gift-cards/purchase
 *
 * Initializes Paystack payment for purchasing a gift card. Webhook will issue the code + fund balance.
 */
export async function POST(request: NextRequest) {
  const rateLimit = await checkPublicMutationRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } },
    );
  }

  try {
    let tenantId: string;
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
    } catch (tenantErr) {
      console.error("Tenant resolution failed in POST /api/public/gift-cards/purchase:", tenantErr);
      return NextResponse.json(
        { data: null, error: { message: "Tenant not configured", code: "TENANT_UNAVAILABLE" } },
        { status: 503 }
      );
    }

    const flags = await getPaymentFeatureFlagsForTenant(tenantId);
    if (!flags.gift_cards) {
      return errorResponse("Gift cards are currently unavailable.", "FEATURE_DISABLED", 403);
    }
    if (!flags.payment_paystack) {
      return errorResponse("Online payment for gift cards is currently unavailable.", "FEATURE_DISABLED", 403);
    }

    const supabase = await getSupabaseServer();
    const body = await request.json();
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: { message: "Validation failed", code: "VALIDATION_ERROR" } }, { status: 400 });
    }

    // Require authentication - only signed-in customers can purchase gift cards
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { data: null, error: { message: "Authentication required. Please sign in to purchase gift cards.", code: "AUTH_REQUIRED" } },
        { status: 401 }
      );
    }

    const purchaserUserId = user.id;

    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const currency = parsed.data.currency || lastResortCurrency;
    const amount = parsed.data.amount;
    const quantity = parsed.data.quantity || 1;
    const totalAmount = multiplyMoney(amount, quantity);

    const email = user?.email || parsed.data.recipient_email;
    if (!email) {
      return NextResponse.json({ data: null, error: { message: "Email is required", code: "VALIDATION_ERROR" } }, { status: 400 });
    }

    const { data: order, error: orderError } = await (supabase.from("gift_card_orders") as any)
      .insert({
        purchaser_user_id: purchaserUserId,
        recipient_email: parsed.data.recipient_email || null,
        provider_id: null, // Platform-only gift cards (no provider_id)
        tenant_id: tenantId,
        amount,
        quantity,
        total_amount: totalAmount,
        currency,
        status: "pending",
      })
      .select("*")
      .single();

    if (orderError || !order) throw orderError || new Error("Failed to create order");

    const reference = generateTransactionReference("giftcard", order.id);
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/checkout/success`;

    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: convertToSmallestUnit(totalAmount),
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        gift_card_order_id: order.id,
        purchaser_user_id: purchaserUserId,
        recipient_email: parsed.data.recipient_email || null,
        quantity: quantity,
        // provider_id removed - platform-only gift cards
      },
      tenantId,
    });

    const paymentUrl = paystackData?.data?.authorization_url || null;

    await (supabase.from("gift_card_orders") as any)
      .update({ paystack_reference: reference })
      .eq("id", order.id);

    return successResponse({
      order_id: order.id,
      payment_url: paymentUrl,
      reference,
    });
  } catch (error) {
    return handleApiError(error, "Failed to initialize gift card purchase");
  }
}

