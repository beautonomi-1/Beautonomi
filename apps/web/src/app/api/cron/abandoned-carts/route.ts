import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import {
  ABANDONED_CART_IDLE_MIN_MS,
  ABANDONED_CART_MAX_AGE_MS,
  countsAsAbandonedCartSend,
  groupAbandonedCartCandidates,
  shouldSendAbandonedCartReminder,
  type AbandonedCartLine,
  type PaidOrderCover,
} from "@/lib/commerce/abandoned-cart";
import { dispatchTemplateNotification } from "@/lib/notifications/dispatch-template-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOB_NAME = "abandoned-carts";
const CART_BATCH_LIMIT = 500;

/**
 * Abandoned cart recovery (marketing): up to 2 push/email nudges per cart
 * fingerprint, gated by inspiration_and_offers prefs and quiet hours.
 * Ledger: abandoned_cart_reminders (migration 968).
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ ok: false, error: auth.error ?? "unauthorized" }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob());
}

async function runJob() {
  const admin = getSupabaseAdmin();
  const nowMs = Date.now();
  const idleBefore = new Date(nowMs - ABANDONED_CART_IDLE_MIN_MS).toISOString();
  const maxAgeAfter = new Date(nowMs - ABANDONED_CART_MAX_AGE_MS).toISOString();

  const { data: cartRows, error: cartErr } = await admin
    .from("cart_items")
    .select(
      `
      user_id,
      provider_id,
      product_id,
      product_variant_id,
      quantity,
      updated_at,
      product:products (
        name,
        is_active,
        retail_sales_enabled,
        track_stock_quantity,
        quantity
      ),
      product_variant:product_variants (
        quantity
      )
    `,
    )
    .lt("updated_at", idleBefore)
    .gt("updated_at", maxAgeAfter)
    .order("updated_at", { ascending: true })
    .limit(CART_BATCH_LIMIT);

  if (cartErr) {
    console.error("[abandoned-carts] query failed", cartErr);
    return NextResponse.json({ ok: false, error: cartErr.message }, { status: 500 });
  }

  const lines: AbandonedCartLine[] = (cartRows ?? []).map((row) => {
    const product = row.product as {
      name?: string;
      is_active?: boolean | null;
      retail_sales_enabled?: boolean | null;
      track_stock_quantity?: boolean | null;
      quantity?: number | null;
    } | null;
    const variant = row.product_variant as { quantity?: number | null } | null;
    return {
      user_id: row.user_id as string,
      provider_id: row.provider_id as string,
      product_id: row.product_id as string,
      product_variant_id: (row.product_variant_id as string | null) ?? null,
      quantity: Number(row.quantity ?? 1),
      updated_at: row.updated_at as string,
      product_name: product?.name ?? "Item",
      is_active: product?.is_active ?? null,
      retail_sales_enabled: product?.retail_sales_enabled ?? null,
      track_stock_quantity: product?.track_stock_quantity ?? null,
      product_quantity: product?.quantity ?? null,
      variant_quantity: variant?.quantity ?? null,
    };
  });

  if (lines.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, candidates: 0 });
  }

  const userIds = [...new Set(lines.map((l) => l.user_id))];
  const productIds = [...new Set(lines.map((l) => l.product_id))];

  const { data: orderItems, error: orderErr } = await admin
    .from("product_order_items")
    .select(
      `
      product_id,
      product_variant_id,
      product_orders!inner (
        customer_id,
        payment_status,
        paid_at,
        created_at
      )
    `,
    )
    .in("product_id", productIds);

  if (orderErr) {
    console.error("[abandoned-carts] paid-order lookup failed", orderErr);
    return NextResponse.json({ ok: false, error: orderErr.message }, { status: 500 });
  }

  const covers: PaidOrderCover[] = [];
  for (const item of orderItems ?? []) {
    const order = item.product_orders as {
      customer_id?: string;
      payment_status?: string;
      paid_at?: string | null;
      created_at?: string;
    } | null;
    if (!order?.customer_id || !userIds.includes(order.customer_id)) continue;
    covers.push({
      customer_id: order.customer_id,
      product_id: item.product_id as string,
      product_variant_id: (item.product_variant_id as string | null) ?? null,
      payment_status: order.payment_status ?? "",
      paid_at: order.paid_at ?? null,
      created_at: order.created_at ?? "",
    });
  }

  const candidates = groupAbandonedCartCandidates(lines, covers, nowMs);
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, candidates: 0 });
  }

  const providerIds = [...new Set(candidates.map((c) => c.providerId).filter(Boolean))];
  const tenantByProvider = new Map<string, string | null>();
  if (providerIds.length > 0) {
    const { data: providerRows } = await admin
      .from("providers")
      .select("id, tenant_id")
      .in("id", providerIds);
    for (const row of providerRows ?? []) {
      tenantByProvider.set(row.id as string, (row.tenant_id as string | null) ?? null);
    }
  }

  const fingerprints = candidates.map((c) => c.fingerprint);
  const { data: ledgerRows } = await admin
    .from("abandoned_cart_reminders")
    .select("user_id, cart_fingerprint, send_count, last_sent_at")
    .in("user_id", userIds)
    .in("cart_fingerprint", fingerprints);

  const ledgerKey = (userId: string, fp: string) => `${userId}:${fp}`;
  const ledgerByKey = new Map(
    (ledgerRows ?? []).map((r) => [
      ledgerKey(r.user_id as string, r.cart_fingerprint as string),
      {
        send_count: Number(r.send_count ?? 0),
        last_sent_at: (r.last_sent_at as string | null) ?? null,
      },
    ]),
  );

  let sent = 0;
  for (const candidate of candidates) {
    const ledger = ledgerByKey.get(ledgerKey(candidate.userId, candidate.fingerprint));
    if (!shouldSendAbandonedCartReminder(ledger, nowMs)) continue;

    const tenantId = tenantByProvider.get(candidate.providerId) ?? null;
    try {
      const result = await dispatchTemplateNotification(
        "abandoned_cart",
        [candidate.userId],
        {
          item_summary: candidate.itemSummary,
          item_count: candidate.itemCount,
        },
        ["push", "email"],
        { appType: "customer", tenantId },
      );

      if (!countsAsAbandonedCartSend(result)) continue;

      const nowIso = new Date(nowMs).toISOString();
      const prevCount = ledger?.send_count ?? 0;
      const nextCount = prevCount + 1;

      const ledgerPayload: Record<string, unknown> = {
        user_id: candidate.userId,
        cart_fingerprint: candidate.fingerprint,
        provider_id: candidate.providerId,
        send_count: nextCount,
        last_sent_at: nowIso,
        updated_at: nowIso,
        metadata: {
          item_count: candidate.itemCount,
          product_ids: candidate.lines.map((l) => l.product_id),
        },
      };
      if (prevCount === 0) {
        ledgerPayload.first_sent_at = nowIso;
      }

      const { error: upsertErr } = await admin
        .from("abandoned_cart_reminders")
        .upsert(ledgerPayload, { onConflict: "user_id,cart_fingerprint" });

      if (upsertErr) {
        console.warn("[abandoned-carts] ledger upsert failed", candidate.userId, upsertErr);
        continue;
      }

      ledgerByKey.set(ledgerKey(candidate.userId, candidate.fingerprint), {
        send_count: nextCount,
        last_sent_at: nowIso,
      });
      sent += 1;
    } catch (err) {
      console.warn("[abandoned-carts] reminder failed", candidate.userId, err);
    }
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, sent });
}
