import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { subtractMoney } from "@beautonomi/utils";
import { clearCustomerCartForProvider } from "@/lib/orders/product-order-lifecycle";
import { ensurePackageEntitlementsFromProductOrder } from "@/lib/orders/ensure-package-entitlements-from-product-order";

type RecordProductOrderPaymentInput = {
  supabase: SupabaseClient;
  productOrderId: string;
  reference: string;
  amountMajor: number;
  feesMajor?: number;
  source: "paystack_verify" | "paystack_webhook" | "wallet_checkout";
  provider: "paystack" | "wallet";
};

export async function recordProductOrderPayment(
  input: RecordProductOrderPaymentInput,
): Promise<{ ok: boolean; duplicate: boolean }> {
  const { supabase, productOrderId, reference, amountMajor, feesMajor = 0, source, provider } = input;

  const { data: order, error: orderErr } = await (supabase.from("product_orders") as any)
    .select(
      "id, tenant_id, provider_id, customer_id, order_number, total_amount, platform_fee, payment_status, payment_reference",
    )
    .eq("id", productOrderId)
    .maybeSingle();

  if (orderErr || !order) {
    throw orderErr || new Error("Product order not found");
  }

  // Order-level idempotency: if the order is already paid, don't create duplicate ledger entries
  if ((order as any).payment_status === "paid") {
    return { ok: true, duplicate: true };
  }

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: (order as any).tenant_id ?? null,
    provider_id: (order as any).provider_id ?? null,
  });

  const existingTx = await (supabase.from("payment_transactions") as any)
    .select("id")
    .eq("provider", provider)
    .eq("reference", reference)
    .maybeSingle();
  const alreadyRecorded = Boolean(existingTx.data);

  const platformFee = Number((order as any).platform_fee || 0);
  const orderTotal = Number((order as any).total_amount || amountMajor);
  const grossForProvider = Math.max(0, subtractMoney(orderTotal, platformFee));
  const providerEarnings = grossForProvider;

  await (supabase.from("product_orders") as any)
    .update({
      tenant_id: financeTenantId,
      payment_status: "paid",
      payment_reference: reference,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
    })
    .eq("id", productOrderId);

  const customerId = (order as any).customer_id as string | undefined;
  const providerId = (order as any).provider_id as string | undefined;
  if (customerId && providerId) {
    await clearCustomerCartForProvider(supabase, customerId, providerId);
  }

  if (alreadyRecorded) {
    return { ok: true, duplicate: true };
  }

  await (supabase.from("payment_transactions") as any).insert({
    booking_id: null,
    reference,
    amount: amountMajor,
    fees: feesMajor,
    net_amount: subtractMoney(amountMajor, feesMajor),
    status: "success",
    provider,
    transaction_type: "charge",
    metadata: {
      kind: "product_order",
      product_order_id: productOrderId,
      source,
    },
    created_at: new Date().toISOString(),
  });

  try {
    await ensurePackageEntitlementsFromProductOrder(supabase, productOrderId);
  } catch (e) {
    console.error("[recordProductOrderPayment] ensurePackageEntitlementsFromProductOrder", e);
  }

  await (supabase.from("finance_transactions") as any).insert([
    {
      booking_id: null,
      provider_id: (order as any).provider_id ?? null,
      tenant_id: financeTenantId,
      transaction_type: "payment",
      amount: grossForProvider,
      fees: feesMajor,
      commission: platformFee,
      net: platformFee,
      description: `Product order payment ${(order as any).order_number ?? productOrderId}`,
      created_at: new Date().toISOString(),
    },
    {
      booking_id: null,
      provider_id: (order as any).provider_id ?? null,
      tenant_id: financeTenantId,
      transaction_type: "provider_earnings",
      amount: providerEarnings,
      fees: 0,
      commission: 0,
      net: providerEarnings,
      description: `Provider earnings from product order ${(order as any).order_number ?? productOrderId}`,
      created_at: new Date().toISOString(),
    },
    {
      booking_id: null,
      provider_id: (order as any).provider_id ?? null,
      tenant_id: financeTenantId,
      transaction_type: "platform_fee",
      amount: platformFee,
      fees: 0,
      commission: 0,
      net: platformFee,
      description: `Platform fee from product order ${(order as any).order_number ?? productOrderId}`,
      created_at: new Date().toISOString(),
    },
  ]);

  return { ok: true, duplicate: false };
}

