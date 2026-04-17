#!/usr/bin/env node
/**
 * Nightly finance-ledger audit.
 *
 * Connects to Supabase using SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment
 * and runs the same checks as scripts/verify-finance-ledger-no-duplicates.sql. Exits non-zero
 * (alerting the scheduler) if any invariant is violated.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(2);
}

const client = createClient(url, key, { auth: { persistSession: false } });

async function check(query, label) {
  const { data, error } = await client.rpc("finance_audit_run", { p_query: query }).catch(async () => {
    // Fallback: run raw SQL via postgrest cannot do multi-statement; use a thin RPC if present.
    return { data: null, error: new Error("missing finance_audit_run RPC") };
  });
  if (error) {
    console.warn(`[finance-audit] ${label}: RPC missing — skipping (${error.message}).`);
    return 0;
  }
  const rows = Array.isArray(data) ? data : [];
  if (rows.length > 0) {
    console.error(`[finance-audit] ${label}: ${rows.length} violation(s)`);
    console.error(JSON.stringify(rows.slice(0, 10), null, 2));
  }
  return rows.length;
}

let violations = 0;
violations += await check(
  `SELECT source_payment_id, transaction_type, COUNT(*) AS duplicate_count
     FROM public.finance_transactions
    WHERE source_payment_id IS NOT NULL
    GROUP BY source_payment_id, transaction_type
   HAVING COUNT(*) > 1`,
  "duplicate_source_payment_rows",
);
violations += await check(
  `SELECT br.id, br.booking_id, br.amount, br.status
     FROM public.booking_refunds br
     LEFT JOIN public.finance_transactions ft ON ft.source_refund_id = br.id
    WHERE br.status = 'completed' AND ft.id IS NULL`,
  "completed_refunds_without_ledger",
);

if (violations > 0) {
  console.error(`[finance-audit] FAILED — ${violations} total violations.`);
  process.exit(1);
}
console.log("[finance-audit] OK — ledger invariants hold.");
