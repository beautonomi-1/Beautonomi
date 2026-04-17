import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { bookShippingForOrder } from "./shipping";

// F28: re-export so callers can `import { bookShippingForOrder } from "@/lib/orders/product-order-lifecycle"`.
export { bookShippingForOrder };

/**
 * Restore inventory for all line items on a product order (provider cancel / payment abandon).
 */
export async function restockProductOrderLineItems(
  supabase: SupabaseClient,
  orderId: string,
): Promise<void> {
  const { data: items } = await (supabase.from("product_order_items") as any)
    .select("product_id, product_variant_id, quantity")
    .eq("order_id", orderId);

  if (!items?.length) return;

  for (const item of items) {
    if (item.product_variant_id) {
      try {
        await (supabase.rpc as any)("increment_product_variant_stock", {
          p_variant_id: item.product_variant_id,
          p_quantity: item.quantity,
        });
      } catch {
        const { data: v } = await (supabase.from("product_variants") as any)
          .select("quantity")
          .eq("id", item.product_variant_id)
          .single();
        if (v) {
          await (supabase.from("product_variants") as any)
            .update({ quantity: (v.quantity ?? 0) + item.quantity })
            .eq("id", item.product_variant_id);
        }
      }
    } else if (item.product_id) {
      try {
        await supabase.rpc("increment_product_stock" as any, {
          p_product_id: item.product_id,
          p_quantity: item.quantity,
        });
      } catch {
        const { data: prod } = await (supabase.from("products") as any)
          .select("quantity")
          .eq("id", item.product_id)
          .single();
        if (prod) {
          await (supabase.from("products") as any)
            .update({ quantity: (prod.quantity ?? 0) + item.quantity })
            .eq("id", item.product_id);
        }
      }
    }
  }
}

export async function clearCustomerCartForProvider(
  supabase: SupabaseClient,
  customerId: string,
  providerId: string,
): Promise<void> {
  await (supabase.from("cart_items") as any)
    .delete()
    .eq("user_id", customerId)
    .eq("provider_id", providerId);
}

type OrderRow = {
  id: string;
  customer_id: string;
  provider_id: string;
  tenant_id?: string | null;
  wallet_amount?: number | string | null;
  currency?: string | null;
};

export async function creditWalletForProductOrderIfNeeded(
  supabase: SupabaseClient,
  order: OrderRow,
  description: string,
  referenceType: string,
): Promise<void> {
  const w = Number(order.wallet_amount ?? 0);
  if (w <= 0) return;

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: order.tenant_id ?? null,
    provider_id: order.provider_id ?? null,
  });

  await (supabase.rpc as any)("wallet_credit_admin", {
    p_user_id: order.customer_id,
    p_amount: w,
    p_currency: order.currency || "ZAR",
    p_description: description,
    p_reference_id: order.id,
    p_reference_type: referenceType,
    p_tenant_id: financeTenantId,
  });

  await (supabase.from("product_orders") as any)
    .update({ wallet_amount: "0.00" })
    .eq("id", order.id);
}

/**
 * Cancel stale online orders for the same checkout so stock is not double-reserved.
 */
export async function cancelStalePendingPaystackProductOrders(
  supabase: SupabaseClient,
  customerId: string,
  providerId: string,
  excludeOrderId?: string,
): Promise<void> {
  let q = (supabase.from("product_orders") as any)
    .select("id, customer_id, provider_id, tenant_id, wallet_amount, currency")
    .eq("customer_id", customerId)
    .eq("provider_id", providerId)
    .eq("payment_status", "pending")
    .eq("payment_method", "paystack")
    .eq("status", "pending");

  if (excludeOrderId) {
    q = q.neq("id", excludeOrderId);
  }

  const { data: stale } = await q;

  for (const row of stale ?? []) {
    const o = row as OrderRow;
    await creditWalletForProductOrderIfNeeded(
      supabase,
      o,
      `Wallet refund (checkout restarted) for order`,
      "product_order_superseded",
    );
    await restockProductOrderLineItems(supabase, o.id);
    await (supabase.from("product_orders") as any)
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "Replaced by a new checkout",
        payment_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", o.id);
  }
}
