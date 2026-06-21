/**
 * GET /api/cron/expire-pending-payment-orders
 *
 * §Orders-audit 2026-06 — Self-healing for abandoned/declined product-order card checkouts.
 *
 * Like bookings, product orders are "create-then-pay": the `product_orders` row
 * is created AND stock is decremented before the customer completes Paystack. If
 * the card is declined or the customer abandons the hosted page, Paystack often
 * emits no `charge.failed` webhook, so the order is left at:
 *
 *     status = 'pending'  AND  payment_status = 'pending'  AND  payment_method = 'paystack'
 *
 * That row keeps the stock reserved (and any wallet split debited) indefinitely.
 * Today the only cleanup is `cancelStalePendingPaystackProductOrders`, which runs
 * only when the SAME customer starts another checkout for the SAME provider.
 *
 * This sweep cancels such orders once they are older than
 * `PENDING_ORDER_TTL_MINUTES`, restocking line items and reversing any wallet
 * split via the shared lifecycle helpers (idempotent wallet reversal).
 *
 * Only `order_source = 'online'` + `payment_method = 'paystack'` + both statuses
 * `pending` are touched, so walk-in/appointment/paid orders are never affected.
 *
 * Meant to run every ~10 minutes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import {
  restockProductOrderLineItems,
  creditWalletForProductOrderIfNeeded,
} from "@/lib/orders/product-order-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Minutes an unpaid card order may sit before stock is released. */
const DEFAULT_TTL_MINUTES = 30;
const BATCH_LIMIT = 200;

type StaleOrderRow = {
  id: string;
  customer_id: string;
  provider_id: string;
  tenant_id: string | null;
  wallet_amount: number | string | null;
  currency: string | null;
};

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? "unauthorized" },
      { status: 401 },
    );
  }

  const ttlMinutes = (() => {
    const raw = Number(process.env.PENDING_ORDER_TTL_MINUTES);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MINUTES;
  })();

  const admin = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();

  const { data: stale, error } = await admin
    .from("product_orders")
    .select("id, customer_id, provider_id, tenant_id, wallet_amount, currency")
    .eq("status", "pending")
    .eq("payment_status", "pending")
    .eq("payment_method", "paystack")
    .eq("order_source", "online")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[expire-pending-payment-orders] query failed", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const candidates = (stale as StaleOrderRow[] | null) ?? [];
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, ttl_minutes: ttlMinutes, candidates: 0, expired: 0 });
  }

  let expired = 0;
  for (const order of candidates) {
    try {
      // Atomically claim the cancellation FIRST, only while the order is still
      // `pending`. This wins exactly once and never races a late webhook / verify
      // that paid the order, nor a concurrent cron run — so the (non-idempotent)
      // restock below runs at most once and only for genuinely abandoned orders.
      const { data: claimed } = await (admin.from("product_orders") as any)
        .update({
          status: "cancelled",
          payment_status: "failed",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: "Payment was not completed in time — stock released",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("payment_status", "pending")
        .eq("status", "pending")
        .select("id");

      if ((claimed?.length ?? 0) === 0) continue; // already paid/cancelled elsewhere

      // Reverse any wallet split (idempotent) and restock line items.
      await creditWalletForProductOrderIfNeeded(
        admin,
        order,
        "Wallet refund (online payment not completed)",
        "product_order_payment_abandoned",
      );
      await restockProductOrderLineItems(admin, order.id);

      expired += 1;
    } catch (err) {
      console.warn("[expire-pending-payment-orders] release failed", order.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    ttl_minutes: ttlMinutes,
    candidates: candidates.length,
    expired,
  });
}
