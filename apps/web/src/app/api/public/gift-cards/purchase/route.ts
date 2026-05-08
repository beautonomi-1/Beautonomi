import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, successResponse, errorResponse, requireRoleInApi } from "@/lib/supabase/api-helpers";
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
  source: z.string().optional(),
  campaign_id: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  callback_url: z
    .string()
    .trim()
    .optional()
    .refine((v) => {
      if (!v) return true;
      return v.startsWith("https://") || v.startsWith("http://") || v.startsWith("customer://") || v.startsWith("exp://");
    }, { message: "Invalid callback URL" }),
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

    let authUser: { id: string; email?: string | null };
    try {
      const auth = await requireRoleInApi(
        ["customer", "provider_owner", "provider_staff", "superadmin"],
        request,
      );
      authUser = auth.user;
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "";
      if (message.toLowerCase().includes("authentication required")) {
        return errorResponse(
          "Authentication required. Please sign in to purchase gift cards.",
          "AUTH_REQUIRED",
          401,
        );
      }
      return errorResponse("You do not have access to purchase gift cards.", "FORBIDDEN", 403);
    }
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: { message: "Validation failed", code: "VALIDATION_ERROR" } }, { status: 400 });
    }

    const purchaserUserId = authUser.id;

    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const currency = parsed.data.currency || lastResortCurrency;
    const amount = parsed.data.amount;
    const quantity = parsed.data.quantity || 1;
    const totalAmount = multiplyMoney(amount, quantity);

    const email =
      authUser.email ||
      (await supabase.from("users").select("email").eq("id", purchaserUserId).maybeSingle()).data?.email ||
      parsed.data.recipient_email;
    if (!email) {
      return NextResponse.json({ data: null, error: { message: "Email is required", code: "VALIDATION_ERROR" } }, { status: 400 });
    }
    const attribution = {
      source: parsed.data.source || "gift_card_purchase",
      campaign_id: parsed.data.campaign_id || undefined,
      utm_source: parsed.data.utm_source || undefined,
      utm_medium: parsed.data.utm_medium || undefined,
      utm_campaign: parsed.data.utm_campaign || undefined,
    };

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
        metadata: {
          source: "gift_card_purchase",
          attribution,
        },
      })
      .select("*")
      .single();

    if (orderError || !order) throw orderError || new Error("Failed to create order");

    const reference = generateTransactionReference("giftcard", order.id);
    const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const callbackUrl =
      parsed.data.callback_url?.trim() ||
      (appBase ? `${appBase}/gift-card/purchase/success` : `${process.env.NEXT_PUBLIC_APP_URL || ""}/checkout/success`);

    let paystackData: Awaited<ReturnType<typeof initializePaystackTransaction>>;
    try {
      paystackData = await initializePaystackTransaction({
        email,
        amountInSmallestUnit: convertToSmallestUnit(totalAmount),
        currency,
        reference,
        callback_url: callbackUrl,
        metadata: {
          gift_card_order_id: order.id,
          purchaser_user_id: purchaserUserId,
          recipient_email: parsed.data.recipient_email || null,
          quantity,
          attribution,
          // provider_id removed - platform-only gift cards
        },
        tenantId,
      });
    } catch (error) {
      await (supabase.from("gift_card_orders") as any)
        .update({ status: "failed", paystack_reference: reference, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      throw error;
    }

    const paymentUrl = paystackData?.data?.authorization_url || null;

    const { error: updateError } = await (supabase.from("gift_card_orders") as any)
      .update({ paystack_reference: reference })
      .eq("id", order.id);
    if (updateError) throw updateError;

    return successResponse({
      order_id: order.id,
      payment_url: paymentUrl,
      reference,
    });
  } catch (error) {
    return handleApiError(error, "Failed to initialize gift card purchase");
  }
}

