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

/**
 * Reverse wallet debit, restock, and cancel a product order when checkout
 * finalization fails after money was already moved.
 *
 * Never reverses an order that is already `payment_status=paid` — that would
 * leave finance_transactions / payment_transactions out of sync with wallet.
 */
export async function rollbackFailedProductOrderCheckout(
  supabase: SupabaseClient,
  order: OrderRow,
  reason = "Checkout could not be completed",
  opts?: { restock?: boolean },
): Promise<{ rolledBack: boolean; skippedPaid: boolean }> {
  const { data: live } = await (supabase.from("product_orders") as any)
    .select("id, payment_status, status")
    .eq("id", order.id)
    .maybeSingle();

  if (String((live as { payment_status?: string } | null)?.payment_status ?? "") === "paid") {
    console.error(
      "[product-order] Skipping checkout rollback — order already paid (ledger must stay intact)",
      { orderId: order.id, reason },
    );
    return { rolledBack: false, skippedPaid: true };
  }

  await creditWalletForProductOrderIfNeeded(
    supabase,
    order,
    `Wallet refund (${reason})`,
    "product_order_checkout_failed",
  );
  if (opts?.restock !== false) {
    await restockProductOrderLineItems(supabase, order.id);
  }
  await (supabase.from("product_orders") as any)
    .update({
      status: "cancelled",
      payment_status: "failed",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .neq("payment_status", "paid");

  return { rolledBack: true, skippedPaid: false };
}

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

  // §Wallet-reversal (audit 2026-06): this helper is reachable from both the
  // charge.failed webhook and the stale-order sweep, so two callers could both
  // see wallet_amount > 0 and double-credit. ATOMICALLY claim the reversal by
  // zeroing wallet_amount first (only while it is still > 0); only the winner
  // credits. Restore the amount if the credit fails so a later retry can reverse.
  const { data: claimed, error: claimError } = await (supabase.from("product_orders") as any)
    .update({ wallet_amount: "0.00" })
    .eq("id", order.id)
    .gt("wallet_amount", 0)
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("[product-order] Failed to claim wallet reversal:", claimError);
    return;
  }
  if (!claimed) return; // Already reversed by another path.

  const { error: creditError } = await (supabase.rpc as any)("wallet_credit_admin", {
    p_user_id: order.customer_id,
    p_amount: w,
    p_currency: order.currency || "ZAR",
    p_description: description,
    p_reference_id: order.id,
    p_reference_type: referenceType,
    p_tenant_id: financeTenantId,
    // One reversal per order regardless of which path (charge.failed vs stale
    // sweep) triggers it. The atomic wallet_amount claim above already gates
    // this; the key is a hard DB backstop.
    p_idempotency_key: `product_order_wallet_reversal:${order.id}`,
  });

  if (creditError) {
    console.error("[product-order] Wallet reversal credit failed, restoring wallet_amount:", creditError);
    await (supabase.from("product_orders") as any)
      .update({ wallet_amount: w.toFixed(2) })
      .eq("id", order.id);
  }
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
    // Atomically claim cancellation while still pending (matches expire cron).
    const { data: claimed } = await (supabase.from("product_orders") as any)
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "Replaced by a new checkout",
        payment_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", o.id)
      .eq("payment_status", "pending")
      .eq("status", "pending")
      .select("id");

    if ((claimed?.length ?? 0) === 0) continue;

    await creditWalletForProductOrderIfNeeded(
      supabase,
      o,
      `Wallet refund (checkout restarted) for order`,
      "product_order_superseded",
    );
    await restockProductOrderLineItems(supabase, o.id);
  }
}
