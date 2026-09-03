import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/** Deferred (cash-in, net = 0) writers and their recognition counterparts. */
const DEFERRED_PAIRS: Array<{ product: string; deferred: string[]; recognition: string[] }> = [
  { product: "gift_cards", deferred: ["gift_card_sale"], recognition: ["gift_card_liability_reduction", "gift_card_breakage"] },
  { product: "memberships", deferred: ["membership_sale"], recognition: ["membership_recognition"] },
  { product: "subscriptions", deferred: ["provider_subscription_payment"], recognition: ["subscription_recognition"] },
  { product: "ads", deferred: ["provider_ads_payment"], recognition: ["ads_recognition"] },
  { product: "marketing_credits", deferred: ["provider_marketing_credit_topup"], recognition: ["marketing_credit_recognition"] },
];

const ONLINE_PROVIDERS = ["paystack", "stripe", "flutterwave"];
const ROW_CAP = 20_000;

type LedgerRow = { transaction_type: string; amount: number | string | null; net: number | string | null };

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function glAccountBalance(
  supabase: SupabaseClient,
  tenantId: string,
  code: string,
): Promise<{ code: string; name: string | null; balance: number; debits: number; credits: number; found: boolean }> {
  const { data: acct } = await supabase
    .from("gl_accounts")
    .select("id, name, normal_side")
    .eq("code", code)
    .maybeSingle();
  if (!acct) return { code, name: null, balance: 0, debits: 0, credits: 0, found: false };
  const account = acct as { id: string; name: string; normal_side: string };

  const { data: lines } = await supabase
    .from("journal_lines")
    .select("side, reporting_amount, journal_entries!inner(tenant_id)")
    .eq("account_id", account.id)
    .eq("journal_entries.tenant_id", tenantId)
    .limit(ROW_CAP);

  let debits = 0;
  let credits = 0;
  for (const l of (lines ?? []) as Array<{ side: string; reporting_amount: number | string }>) {
    if (l.side === "debit") debits += num(l.reporting_amount);
    else credits += num(l.reporting_amount);
  }
  const balance = account.normal_side === "debit" ? debits - credits : credits - debits;
  return { code, name: account.name, balance, debits, credits, found: true };
}

async function countUnrecognizedOnlinePayments(
  supabase: SupabaseClient,
  tenantId: string,
  sinceIso: string,
): Promise<{ count: number; amount: number; scanned: number; capped: boolean }> {
  const { data: payments } = await supabase
    .from("booking_payments")
    .select("id, booking_id, amount, bookings!inner(tenant_id)")
    .eq("status", "completed")
    .in("payment_provider", ONLINE_PROVIDERS)
    .eq("bookings.tenant_id", tenantId)
    .gte("created_at", sinceIso)
    .lt("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(ROW_CAP);

  const rows = (payments ?? []) as Array<{ id: string; booking_id: string; amount: number | string }>;
  if (rows.length === 0) return { count: 0, amount: 0, scanned: 0, capped: false };

  const bookingIds = [...new Set(rows.map((r) => r.booking_id))];
  const attributed = new Set<string>();
  const legacyBookings = new Set<string>();
  for (let i = 0; i < bookingIds.length; i += 500) {
    const chunk = bookingIds.slice(i, i + 500);
    const { data: ledger } = await supabase
      .from("finance_transactions")
      .select("booking_id, source_payment_id")
      .in("booking_id", chunk)
      .eq("transaction_type", "payment");
    for (const r of (ledger ?? []) as Array<{ booking_id: string; source_payment_id?: string | null }>) {
      if (r.source_payment_id) attributed.add(String(r.source_payment_id));
      else legacyBookings.add(String(r.booking_id));
    }
  }

  let count = 0;
  let amount = 0;
  for (const p of rows) {
    if (attributed.has(p.id) || legacyBookings.has(p.booking_id)) continue;
    count += 1;
    amount += num(p.amount);
  }
  return { count, amount, scanned: rows.length, capped: rows.length >= ROW_CAP };
}

/**
 * GET /api/admin/finance/ledger-health
 * Query: days (default 30, max 365) — window for movement-based metrics.
 * Balances (GL 2400/2600/9999) are all-time.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") || "30", 10)));
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();
    const nowIso = now.toISOString();
    const h24Iso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const d7Iso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── Drift summary (shadow GL vs finance_transactions) ────────────────────
    const drift = await supabase.rpc("ledger_reconciliation_summary", { p_from: sinceIso, p_to: nowIso });
    const driftRow = Array.isArray(drift.data) ? (drift.data[0] ?? null) : (drift.data ?? null);

    // ── Unmapped postings (suspense) ─────────────────────────────────────────
    const [{ count: unmappedOpen }, suspense] = await Promise.all([
      supabase
        .from("reconciliation_exceptions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        .eq("mismatch_reason", "unmapped_transaction_type"),
      glAccountBalance(supabase, tenantId, "9999"),
    ]);

    // ── Deferred vs recognized ───────────────────────────────────────────────
    const allTypes = DEFERRED_PAIRS.flatMap((p) => [...p.deferred, ...p.recognition]);
    const { data: deferredRows } = await supabase
      .from("finance_transactions")
      .select("transaction_type, amount, net")
      .eq("tenant_id", tenantId)
      .in("transaction_type", allTypes)
      .gte("created_at", sinceIso)
      .limit(ROW_CAP);
    const byType = new Map<string, { count: number; amount: number; net: number; net_zero_rows: number }>();
    for (const r of (deferredRows ?? []) as LedgerRow[]) {
      const cur = byType.get(r.transaction_type) ?? { count: 0, amount: 0, net: 0, net_zero_rows: 0 };
      cur.count += 1;
      cur.amount += num(r.amount);
      cur.net += num(r.net);
      if (num(r.net) === 0) cur.net_zero_rows += 1;
      byType.set(r.transaction_type, cur);
    }
    const deferredVsRecognized = DEFERRED_PAIRS.map((pair) => {
      const deferred = pair.deferred.reduce(
        (acc, t) => {
          const v = byType.get(t);
          if (!v) return acc;
          return { rows: acc.rows + v.count, amount: acc.amount + v.amount, non_zero_net_rows: acc.non_zero_net_rows + (v.count - v.net_zero_rows) };
        },
        { rows: 0, amount: 0, non_zero_net_rows: 0 },
      );
      const recognized = pair.recognition.reduce(
        (acc, t) => {
          const v = byType.get(t);
          if (!v) return acc;
          return { rows: acc.rows + v.count, net: acc.net + v.net };
        },
        { rows: 0, net: 0 },
      );
      return {
        product: pair.product,
        deferred_types: pair.deferred,
        recognition_types: pair.recognition,
        deferred_rows: deferred.rows,
        deferred_cash_in: deferred.amount,
        /** Deferred writers must post net = 0; anything else is a writer bug. */
        deferred_rows_with_nonzero_net: deferred.non_zero_net_rows,
        recognition_rows: recognized.rows,
        recognized_net: recognized.net,
      };
    });

    // ── Liability balances ───────────────────────────────────────────────────
    const [giftCardLiability, membershipLiability] = await Promise.all([
      glAccountBalance(supabase, tenantId, "2400"),
      glAccountBalance(supabase, tenantId, "2600"),
    ]);

    // ── Unrecognized online payments (fleet-wide) ────────────────────────────
    const unrecognized = await countUnrecognizedOnlinePayments(supabase, tenantId, sinceIso);
    if (unrecognized.count > 0) {
      void import("@/lib/integrations/slack/ops-triggers")
        .then(({ slackNotifyUnrecognizedPayments }) =>
          slackNotifyUnrecognizedPayments({
            tenantId,
            count: unrecognized.count,
            amountMajor: unrecognized.amount,
            source: "ledger-health",
          }),
        )
        .catch(() => undefined);
    }

    // ── Staff earnings lines ─────────────────────────────────────────────────
    const { data: staffLines } = await supabase
      .from("staff_earnings_lines")
      .select("kind, amount, backfilled, provider_id, providers!inner(tenant_id)")
      .eq("providers.tenant_id", tenantId)
      .gte("created_at", sinceIso)
      .limit(ROW_CAP);
    const staffByKind: Record<string, { rows: number; amount: number; backfilled: number }> = {};
    for (const l of (staffLines ?? []) as Array<{ kind: string; amount: number | string; backfilled?: boolean }>) {
      const cur = staffByKind[l.kind] ?? { rows: 0, amount: 0, backfilled: 0 };
      cur.rows += 1;
      cur.amount += num(l.amount);
      if (l.backfilled) cur.backfilled += 1;
      staffByKind[l.kind] = cur;
    }

    // ── Webhook signature rejections ─────────────────────────────────────────
    const [sig24, sig7] = await Promise.all([
      supabase
        .from("webhook_events")
        .select("source, attempt_count")
        .eq("event_type", "signature_rejected")
        .gte("created_at", h24Iso)
        .limit(5000),
      supabase
        .from("webhook_events")
        .select("source, attempt_count")
        .eq("event_type", "signature_rejected")
        .gte("created_at", d7Iso)
        .limit(5000),
    ]);
    const groupBySource = (rows: Array<{ source: string; attempt_count?: number | null }> | null) => {
      const out: Record<string, { events: number; attempts: number }> = {};
      for (const r of rows ?? []) {
        const cur = out[r.source] ?? { events: 0, attempts: 0 };
        cur.events += 1;
        cur.attempts += Math.max(1, num(r.attempt_count));
        out[r.source] = cur;
      }
      return out;
    };

    // ── Open finance exceptions ──────────────────────────────────────────────
    const { count: openExceptions } = await supabase
      .from("reconciliation_exceptions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "open");
    const { count: pendingRepairs } = await supabase
      .from("ledger_repair_proposals")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "proposed");

    return successResponse({
      generated_at: nowIso,
      window: { days, since: sinceIso, until: nowIso },
      drift: driftRow
        ? {
            legacy_row_count: num((driftRow as Record<string, unknown>).legacy_row_count),
            shadowed_row_count: num((driftRow as Record<string, unknown>).shadowed_row_count),
            missing_row_count: num((driftRow as Record<string, unknown>).missing_row_count),
            imbalanced_entry_count: num((driftRow as Record<string, unknown>).imbalanced_entry_count),
            legacy_sum_abs: num((driftRow as Record<string, unknown>).legacy_sum_abs),
            ledger_sum_debits: num((driftRow as Record<string, unknown>).ledger_sum_debits),
            ledger_sum_credits: num((driftRow as Record<string, unknown>).ledger_sum_credits),
            available: true,
          }
        : { available: false, error: drift.error?.message ?? "ledger_reconciliation_summary unavailable" },
      unmapped: {
        open_exceptions: unmappedOpen ?? 0,
        suspense_account: suspense,
      },
      unrecognized_payments: unrecognized,
      deferred_vs_recognized: deferredVsRecognized,
      liabilities: {
        gift_cards_2400: giftCardLiability,
        memberships_2600: membershipLiability,
      },
      staff_earnings_lines: {
        by_kind: staffByKind,
        total_rows: Object.values(staffByKind).reduce((s, v) => s + v.rows, 0),
        total_amount: Object.values(staffByKind).reduce((s, v) => s + v.amount, 0),
        capped: (staffLines?.length ?? 0) >= ROW_CAP,
      },
      webhook_signature_rejections: {
        last_24h: groupBySource(sig24.data as Array<{ source: string; attempt_count?: number | null }> | null),
        last_7d: groupBySource(sig7.data as Array<{ source: string; attempt_count?: number | null }> | null),
      },
      queues: {
        open_reconciliation_exceptions: openExceptions ?? 0,
        pending_ledger_repairs: pendingRepairs ?? 0,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to compute ledger health");
  }
}
