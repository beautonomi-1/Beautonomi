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

let rpcAvailable = false;

function namedAuditQuery(name) {
  return startDate ? `${name}:${startDate}:${endDate}` : name;
}

async function ensureFinanceAuditRpc() {
  const { error } = await client.rpc("finance_audit_run", {
    p_query: "ping",
  });
  if (error) {
    console.error(
      `[finance-audit] FATAL: finance_audit_run RPC unavailable (${error.message}). ` +
        "Apply migration 10141_finance_audit_run_allowlist.sql (named queries) before trusting this gate.",
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

violations += await runAuditQuery(
  namedAuditQuery("duplicate_source_payment_rows"),
  "duplicate_source_payment_rows",
);

violations += await runAuditQuery(
  namedAuditQuery("completed_refunds_without_ledger"),
  "completed_refunds_without_ledger",
);

violations += await runAuditQuery(
  namedAuditQuery("paid_product_orders_missing_ledger"),
  "paid_product_orders_missing_ledger",
);

if (violations > 0) {
  console.error(`[finance-audit] FAILED — ${violations} total violations.`);
  process.exit(1);
}

const windowLabel = startDate ? ` (window ${startDate} → ${endDate})` : "";
console.log(`[finance-audit] OK — ledger invariants hold${windowLabel}.`);
