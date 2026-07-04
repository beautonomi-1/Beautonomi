/**
 * POST /api/provider/terminal-orders/[id]/initialize-payment
 * Paystack checkout for a pending terminal order.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orderId } = await params;
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getServiceClient();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const { data: provRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id, business_name")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId = (provRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

    const flagEnabled = await isFeatureEnabledServer(FEATURE_FLAG_KEYS.TERMINAL_ECOMMERCE, tenantId);
    if (!flagEnabled) {
      return errorResponse("Terminal ordering is not available yet.", "FEATURE_DISABLED", 403);
    }

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("terminal_orders")
      .select("id, provider_id, order_status, invoice_status, total_amount, currency, finance_transaction_id, paystack_reference")
      .eq("id", orderId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (orderErr || !order) {
      return errorResponse("Order not found", "NOT_FOUND", 404);
    }

    const o = order as {
      order_status: string;
      invoice_status: string;
      total_amount: number;
      currency?: string;
      finance_transaction_id?: string | null;
    };

    if (o.finance_transaction_id || o.invoice_status === "paid") {
      return errorResponse("This order is already paid.", "ORDER_ALREADY_PAID", 400);
    }
    if (["cancelled", "refunded", "failed"].includes(o.order_status)) {
      return errorResponse("This order cannot be paid.", "ORDER_NOT_PAYABLE", 400);
    }

    const amount = Number(o.total_amount ?? 0);
    if (amount <= 0) {
      return errorResponse("This order has no amount due.", "VALIDATION", 400);
    }

    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();
    const email = (userRow as { email?: string } | null)?.email;
    if (!email) {
      return errorResponse("Provider email is required for payment.", "VALIDATION", 400);
    }

    const reference = generateTransactionReference("terminal_order", orderId);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const callbackUrl = `${appUrl}/provider/settings/sales/terminal-shop?payment_success=1&order_id=${orderId}`;

    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: convertToSmallestUnit(amount),
      currency: o.currency ?? LAST_RESORT_CURRENCY,
      reference,
      callback_url: callbackUrl,
      metadata: {
        terminal_order_id: orderId,
        provider_id: providerId,
        kind: "terminal_order_payment",
      },
      tenantId,
    });

    const paymentUrl = paystackData?.data?.authorization_url ?? null;
    if (!paymentUrl) {
      return errorResponse("Paystack did not return a payment URL.", "PAYSTACK_ERROR", 502);
    }

    await supabaseAdmin
      .from("terminal_orders")
      .update({ paystack_reference: reference, invoice_status: "issued" })
      .eq("id", orderId);

    return successResponse({
      order_id: orderId,
      payment_url: paymentUrl,
      authorization_url: paymentUrl,
      reference,
    });
  } catch (error) {
    return handleApiError(error, "Failed to initialize terminal order payment");
  }
}
