/**
 * Safety net: paid platform-held product_orders without provider_earnings ledger rows.
 * Runs every 15 minutes (see vercel.json). Links legacy rows, then calls recordProductOrderPayment.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import { resolveProductOrderRecordPaymentInput } from "@/lib/orders/resolve-product-order-record-payment-input";
import { tryNotifySlackEvent } from "@/lib/integrations/slack/dispatch";
import { SLACK_EVENT_KEYS } from "@/lib/integrations/slack/event-keys";

export const RECONCILE_PRODUCT_ORDER_LEDGER_SOURCE = "reconcile_product_order_ledger";
const RECENT_GRACE_MS = 5 * 60 * 1000;
const SCAN_LIMIT = 200;
const REVIEW_ALERT_AFTER_MS = 24 * 60 * 60 * 1000;

const PLATFORM_METHODS = ["paystack", "wallet", "gift_card"] as const;

export type ProductOrderReconcileCandidate = {
  id: string;
  tenant_id: string | null;
  provider_id: string | null;
  order_number: string;
  payment_method: string | null;
  payment_reference: string | null;
  total_amount: number | string | null;
  wallet_amount: number | string | null;
  paid_at: string | null;
  confirmed_at: string | null;
  created_at: string | null;
  currency: string | null;
};

export type ProductOrderNeedsReview = {
  productOrderId: string;
  tenantId: string | null;
  currency: string | null;
  reason: string;
  orderNumber: string;
};

export type ReconcileProductOrderLedgerSummary = {
  scanned: number;
  linked: number;
  repaired: number;
  skipped: number;
  needsReview: ProductOrderNeedsReview[];
  errors: string[];
  reviewAlertSent: boolean;
};

function eventEnv(): "production" | "staging" | "development" {
  const e = process.env.BEAUTONOMI_SLACK_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV;
  if (e === "development") return "development";
  if (e === "preview" || e === "staging") return "staging";
  return "production";
}

function ledgerCreatedAtFor(order: ProductOrderReconcileCandidate): string {
  const paid = order.paid_at?.trim();
  if (paid) return paid;
  const confirmed = order.confirmed_at?.trim();
  if (confirmed) return confirmed;
  const created = order.created_at?.trim();
  if (created) return created;
  return new Date().toISOString();
}

async function hasProviderEarnings(
  supabase: SupabaseClient,
  order: ProductOrderReconcileCandidate,
): Promise<boolean> {
  const { data: linked } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("product_order_id", order.id)
    .eq("transaction_type", "provider_earnings")
    .limit(1);
  if ((linked?.length ?? 0) > 0) return true;

  if (!order.provider_id || !order.order_number) return false;

  const { data: legacy } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("provider_id", order.provider_id)
    .is("product_order_id", null)
    .eq("transaction_type", "provider_earnings")
    .ilike("description", `%${order.order_number}%`)
    .limit(1);
  return (legacy?.length ?? 0) > 0;
}

async function linkLegacyFinanceRows(
  supabase: SupabaseClient,
  order: ProductOrderReconcileCandidate,
): Promise<number> {
  if (!order.provider_id || !order.order_number) return 0;

  const { data, error } = await supabase
    .from("finance_transactions")
    .update({ product_order_id: order.id })
    .eq("provider_id", order.provider_id)
    .is("product_order_id", null)
    .in("transaction_type", ["payment", "provider_earnings", "platform_fee"])
    .ilike("description", `%${order.order_number}%`)
    .select("id");

  if (error) {
    console.error("[reconcile-product-order-ledger] link legacy failed", {
      orderId: order.id,
      error,
    });
    return 0;
  }
  return data?.length ?? 0;
}

function isPeriodLockError(message: string): boolean {
  return /locked for tenant|Financial period/i.test(message);
}

async function loadPaymentTxByOrderId(
  supabase: SupabaseClient,
  orderIds: string[],
): Promise<Map<string, { reference: string; amount: number; fees: number; provider: string }>> {
  const map = new Map<string, { reference: string; amount: number; fees: number; provider: string }>();
  if (orderIds.length === 0) return map;

  const idSet = new Set(orderIds);
  const chunks: string[][] = [];
  for (let i = 0; i < orderIds.length; i += 50) {
    chunks.push(orderIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    const orFilter = chunk.map((id) => `metadata->>product_order_id.eq.${id}`).join(",");
    const { data, error } = await supabase
      .from("payment_transactions")
      .select("reference, amount, fees, provider, metadata")
      .eq("status", "success")
      .eq("transaction_type", "charge")
      .or(orFilter);

    if (error) {
      console.error("[reconcile-product-order-ledger] payment_transactions scan failed", error);
      continue;
    }

    for (const row of data ?? []) {
    const meta = (row as { metadata?: { product_order_id?: string; kind?: string } }).metadata;
    const oid = meta?.product_order_id;
    if (!oid || !idSet.has(oid) || meta?.kind !== "product_order") continue;
      map.set(oid, {
        reference: String((row as { reference: string }).reference),
        amount: Number((row as { amount?: number }).amount ?? 0),
        fees: Number((row as { fees?: number }).fees ?? 0),
        provider: String((row as { provider?: string }).provider ?? ""),
      });
    }
  }
  return map;
}

type OpenExceptionRow = {
  id: string;
  external_id?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

async function persistReviewItemsAndAlert(
  supabase: SupabaseClient,
  summary: ReconcileProductOrderLedgerSummary,
  scannedOrderIds: string[],
  now: Date,
): Promise<void> {
  const nowIso = now.toISOString();

  const { data: openRows, error } = await supabase
    .from("reconciliation_exceptions")
    .select("id, external_id, created_at, metadata")
    .eq("source", "ledger")
    .eq("status", "open")
    .eq("metadata->>source", RECONCILE_PRODUCT_ORDER_LEDGER_SOURCE);

  if (error) {
    console.error("[reconcile-product-order-ledger] review queue query failed:", error);
    return;
  }

  const open = (openRows ?? []) as OpenExceptionRow[];
  const openByOrderId = new Map<string, OpenExceptionRow>();
  for (const row of open) {
    if (row.external_id) openByOrderId.set(String(row.external_id), row);
  }

  const stillNeedsReview = new Set(summary.needsReview.map((item) => item.productOrderId));

  for (const orderId of scannedOrderIds) {
    if (stillNeedsReview.has(orderId)) continue;
    const existing = openByOrderId.get(orderId);
    if (!existing) continue;
    await supabase
      .from("reconciliation_exceptions")
      .update({
        status: "matched",
        resolved_at: nowIso,
        metadata: { ...(existing.metadata ?? {}), resolved_by: RECONCILE_PRODUCT_ORDER_LEDGER_SOURCE },
      })
      .eq("id", existing.id);
    openByOrderId.delete(orderId);
  }

  for (const item of summary.needsReview) {
    const existing = openByOrderId.get(item.productOrderId);
    if (existing) {
      await supabase
        .from("reconciliation_exceptions")
        .update({
          mismatch_reason: `product_order_ledger_missing:${item.reason}`.slice(0, 2000),
          metadata: { ...(existing.metadata ?? {}), reason: item.reason, last_seen_at: nowIso },
        })
        .eq("id", existing.id);
      continue;
    }

    if (!item.tenantId) {
      console.warn("[reconcile-product-order-ledger] needs_review without tenant", item.productOrderId);
      continue;
    }

    const { error: insertError } = await supabase.from("reconciliation_exceptions").insert({
      tenant_id: item.tenantId,
      currency: item.currency?.trim() || "ZAR",
      psp: "product_order",
      source: "ledger",
      external_id: item.productOrderId,
      internal_id: item.productOrderId,
      amount: null,
      status: "open",
      mismatch_reason: `product_order_ledger_missing:${item.reason}`.slice(0, 2000),
      metadata: {
        source: RECONCILE_PRODUCT_ORDER_LEDGER_SOURCE,
        product_order_id: item.productOrderId,
        order_number: item.orderNumber,
        reason: item.reason,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
      },
    });
    if (insertError) {
      console.error("[reconcile-product-order-ledger] review insert failed", insertError);
    }
  }

  const staleThreshold = now.getTime() - REVIEW_ALERT_AFTER_MS;
  const stale = Array.from(openByOrderId.values()).filter((row) => {
    const created = row.created_at ? Date.parse(row.created_at) : Number.NaN;
    return Number.isFinite(created) && created <= staleThreshold;
  });

  if (stale.length === 0) return;

  const dayKey = nowIso.slice(0, 10);
  try {
    await tryNotifySlackEvent({
      tenantId: "platform",
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.FINANCE_RECONCILIATION_WARNING,
      dedupeKey: `reconcile-product-order-ledger:needs_review:${dayKey}`,
      entityType: "cron_job",
      entityId: "reconcile-product-order-ledger",
      title: "Product order ledger: orders awaiting review > 24h",
      detailLines: [
        `Open review items older than 24h: ${stale.length}`,
        `Sample orders: ${stale
          .slice(0, 5)
          .map((row) => String(row.external_id ?? "?").slice(0, 8))
          .join(", ")}`,
        `metadata.source = ${RECONCILE_PRODUCT_ORDER_LEDGER_SOURCE}`,
      ],
      actionUrl: "/finance",
    });
    summary.reviewAlertSent = true;
  } catch (err) {
    console.error("[reconcile-product-order-ledger] review alert failed", err);
  }
}

export async function reconcileProductOrderLedger(
  supabase: SupabaseClient,
  options: { now?: Date } = {},
): Promise<ReconcileProductOrderLedgerSummary> {
  const now = options.now ?? new Date();
  const cutoffIso = new Date(now.getTime() - RECENT_GRACE_MS).toISOString();

  const summary: ReconcileProductOrderLedgerSummary = {
    scanned: 0,
    linked: 0,
    repaired: 0,
    skipped: 0,
    needsReview: [],
    errors: [],
    reviewAlertSent: false,
  };

  const { data: candidates, error: listErr } = await supabase
    .from("product_orders")
    .select(
      "id, tenant_id, provider_id, order_number, payment_method, payment_reference, total_amount, wallet_amount, paid_at, confirmed_at, created_at, currency",
    )
    .eq("payment_status", "paid")
    .in("payment_method", [...PLATFORM_METHODS])
    .lt("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(SCAN_LIMIT);

  if (listErr) {
    summary.errors.push(listErr.message);
    return summary;
  }

  const orders = (candidates ?? []) as ProductOrderReconcileCandidate[];
  summary.scanned = orders.length;
  const scannedIds = orders.map((o) => o.id);
  const paymentTxByOrder = await loadPaymentTxByOrderId(supabase, scannedIds);

  for (const order of orders) {
    try {
      if (await hasProviderEarnings(supabase, order)) {
        summary.skipped += 1;
        continue;
      }

      const linkedCount = await linkLegacyFinanceRows(supabase, order);
      if (linkedCount > 0) summary.linked += 1;

      if (await hasProviderEarnings(supabase, order)) {
        summary.skipped += 1;
        continue;
      }

      const tx = paymentTxByOrder.get(order.id);
      const resolved = resolveProductOrderRecordPaymentInput(order, tx ?? null);
      const createdAt = ledgerCreatedAtFor(order);

      const result = await recordProductOrderPayment({
        supabase,
        productOrderId: order.id,
        reference: resolved.reference,
        amountMajor: resolved.amountMajor,
        feesMajor: resolved.feesMajor,
        source: resolved.source,
        provider: resolved.provider,
        ledgerCreatedAt: createdAt,
        skipSideEffects: true,
      });

      if (result.ledgerIncomplete) {
        summary.needsReview.push({
          productOrderId: order.id,
          tenantId: order.tenant_id,
          currency: order.currency,
          reason: "ledger_incomplete_after_repair",
          orderNumber: order.order_number,
        });
        continue;
      }

      if (!result.ok) {
        summary.needsReview.push({
          productOrderId: order.id,
          tenantId: order.tenant_id,
          currency: order.currency,
          reason: "record_payment_not_ok",
          orderNumber: order.order_number,
        });
        continue;
      }

      if (await hasProviderEarnings(supabase, order)) {
        summary.repaired += 1;
      } else if (result.duplicate) {
        summary.skipped += 1;
      } else {
        summary.needsReview.push({
          productOrderId: order.id,
          tenantId: order.tenant_id,
          currency: order.currency,
          reason: "ledger_still_missing_after_repair",
          orderNumber: order.order_number,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isPeriodLockError(message)) {
        summary.needsReview.push({
          productOrderId: order.id,
          tenantId: order.tenant_id,
          currency: order.currency,
          reason: "period_locked",
          orderNumber: order.order_number,
        });
      } else {
        summary.errors.push(`${order.id}: ${message}`);
      }
    }
  }

  try {
    await persistReviewItemsAndAlert(supabase, summary, scannedIds, now);
  } catch (err) {
    console.error("[reconcile-product-order-ledger] persist review failed", err);
  }

  return summary;
}
