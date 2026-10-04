#!/usr/bin/env node
/**
 * Nightly finance-ledger audit.
 *
 * Usage:
 *   node scripts/prod/audit-finance-ledger.mjs
 *   node scripts/prod/audit-finance-ledger.mjs 2026-03-01 2026-03-31
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Requires migration 724 `finance_audit_run` RPC — exits 2 if missing (never false-green).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(2);
}

const client = createClient(url, key, { auth: { persistSession: false } });

function parseDateArg(value, label) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    console.error(`[finance-audit] Invalid ${label} date "${value}" — use YYYY-MM-DD`);
    process.exit(2);
  }
  return value;
}

const startDate = parseDateArg(process.argv[2], "start");
const endDate = parseDateArg(process.argv[3], "end");

if ((startDate && !endDate) || (!startDate && endDate)) {
  console.error("[finance-audit] Provide both start and end dates, or neither.");
  process.exit(2);
}

const windowClause = startDate
  ? `created_at >= '${startDate}T00:00:00.000Z' AND created_at <= '${endDate}T23:59:59.999Z'`
  : null;

const brWindowClause = startDate
  ? `br.created_at >= '${startDate}T00:00:00.000Z' AND br.created_at <= '${endDate}T23:59:59.999Z'`
  : null;

const poWindowClause = startDate
  ? `AND po.created_at >= '${startDate}T00:00:00.000Z' AND po.created_at <= '${endDate}T23:59:59.999Z'`
  : "";

let rpcAvailable = false;

async function ensureFinanceAuditRpc() {
  const { error } = await client.rpc("finance_audit_run", {
    p_query: "SELECT 1 AS ok",
  });
  if (error) {
    console.error(
      `[finance-audit] FATAL: finance_audit_run RPC unavailable (${error.message}). ` +
        "Apply migration 724_finance_audit_run_rpc.sql before trusting this gate.",
    );
    process.exit(2);
  }
  rpcAvailable = true;
}

async function runAuditQuery(query, label) {
  if (!rpcAvailable) {
    console.error(`[finance-audit] FATAL: RPC not verified before ${label}`);
    process.exit(2);
  }

  const normalized = query.replace(/^\s+|\s+$/g, "");
  const { data, error } = await client.rpc("finance_audit_run", { p_query: normalized });
  if (error) {
    console.error(`[finance-audit] FATAL: ${label} query failed (${error.message})`);
    process.exit(2);
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length > 0) {
    console.error(`[finance-audit] ${label}: ${rows.length} violation(s)`);
    console.error(JSON.stringify(rows.slice(0, 10), null, 2));
  }
  return rows.length;
}

await ensureFinanceAuditRpc();

let violations = 0;

const duplicateQuery = `
  SELECT source_payment_id, transaction_type, COUNT(*) AS duplicate_count
    FROM public.finance_transactions
   WHERE source_payment_id IS NOT NULL
     ${windowClause ? `AND ${windowClause}` : ""}
   GROUP BY source_payment_id, transaction_type
  HAVING COUNT(*) > 1`;

violations += await runAuditQuery(duplicateQuery, "duplicate_source_payment_rows");

const refundsQuery = `
  SELECT br.id, br.booking_id, br.amount, br.status
    FROM public.booking_refunds br
    LEFT JOIN public.finance_transactions ft ON ft.source_refund_id = br.id
   WHERE br.status = 'completed' AND ft.id IS NULL
     ${brWindowClause ? `AND ${brWindowClause}` : ""}`;

violations += await runAuditQuery(refundsQuery, "completed_refunds_without_ledger");

const productOrdersQuery = `
  SELECT po.id, po.order_number, po.payment_method, po.created_at
    FROM public.product_orders po
   WHERE po.payment_status = 'paid'
     AND po.payment_method IN ('paystack', 'wallet', 'gift_card')
     AND NOT EXISTS (
       SELECT 1 FROM public.finance_transactions ft
        WHERE ft.transaction_type = 'provider_earnings'
          AND (
            ft.product_order_id = po.id
            OR (
              ft.product_order_id IS NULL
              AND ft.provider_id = po.provider_id
              AND ft.description ILIKE '%' || po.order_number || '%'
            )
          )
     )
     ${poWindowClause}`;

violations += await runAuditQuery(productOrdersQuery, "paid_product_orders_missing_ledger");

if (violations > 0) {
  console.error(`[finance-audit] FAILED — ${violations} total violations.`);
  process.exit(1);
}

const windowLabel = startDate ? ` (window ${startDate} → ${endDate})` : "";
console.log(`[finance-audit] OK — ledger invariants hold${windowLabel}.`);
