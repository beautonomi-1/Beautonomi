import type { SupabaseClient } from "@supabase/supabase-js";

type AuditRow = Record<string, unknown>;

export type IntegrityReportSection = {
  count: number;
  rows: AuditRow[];
  details?: Record<string, unknown>;
};

export type IntegrityReportPayload = {
  generated_at: string;
  tenant_id: string | null;
  limit: number;
  sections: Record<string, IntegrityReportSection>;
};

const ONLINE_PROVIDERS = ["paystack", "stripe", "flutterwave"] as const;

async function rpcRows(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<AuditRow[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.warn(`[finance-integrity-report] ${fn}:`, error.message);
    return [];
  }
  return Array.isArray(data) ? (data as AuditRow[]) : [];
}

async function queryMissingOnlineLedger(
  supabase: SupabaseClient,
  tenantId: string | null,
  limit: number,
): Promise<AuditRow[]> {
  const before = new Date().toISOString();
  const perProvider = Math.max(1, Math.ceil(limit / ONLINE_PROVIDERS.length));
  const batches = await Promise.all(
    ONLINE_PROVIDERS.map((provider) =>
      rpcRows(supabase, "list_online_booking_payments_missing_ledger", {
        p_provider: provider,
        p_before: before,
        p_limit: perProvider,
        p_tenant_id: tenantId,
      }),
    ),
  );
  return batches.flat().slice(0, limit);
}

async function queryDuplicateSourcePaymentRows(
  supabase: SupabaseClient,
  limit: number,
): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from("finance_transactions")
    .select("source_payment_id, transaction_type")
    .not("source_payment_id", "is", null)
    .limit(5000);
  if (error || !data) return [];

  const counts = new Map<string, { source_payment_id: string; transaction_type: string; duplicate_count: number }>();
  for (const row of data as Array<{ source_payment_id?: string | null; transaction_type?: string | null }>) {
    const sid = String(row.source_payment_id ?? "");
    const tt = String(row.transaction_type ?? "");
    const key = `${sid}\0${tt}`;
    const prev = counts.get(key);
    if (prev) prev.duplicate_count += 1;
    else counts.set(key, { source_payment_id: sid, transaction_type: tt, duplicate_count: 1 });
  }
  return [...counts.values()]
    .filter((r) => r.duplicate_count > 1)
    .slice(0, limit);
}

async function queryCompletedRefundsWithoutLedger(
  supabase: SupabaseClient,
  tenantId: string | null,
  limit: number,
): Promise<AuditRow[]> {
  let q = supabase
    .from("booking_refunds")
    .select("id, booking_id, amount, status, created_at, bookings!inner(tenant_id)")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (tenantId) q = q.eq("bookings.tenant_id", tenantId);

  const { data: refunds, error } = await q;
  if (error || !refunds?.length) return [];

  const ids = (refunds as Array<{ id: string }>).map((r) => r.id);
  const { data: ledger } = await supabase
    .from("finance_transactions")
    .select("source_refund_id")
    .in("source_refund_id", ids);
  const withLedger = new Set(
    ((ledger ?? []) as Array<{ source_refund_id?: string | null }>).map((r) => String(r.source_refund_id)),
  );
  return (refunds as AuditRow[]).filter((r) => !withLedger.has(String(r.id)));
}

async function queryPaidProductOrdersMissingLedger(
  supabase: SupabaseClient,
  tenantId: string | null,
  limit: number,
): Promise<AuditRow[]> {
  let q = supabase
    .from("product_orders")
    .select("id, order_number, payment_method, created_at, provider_id, tenant_id")
    .eq("payment_status", "paid")
    .in("payment_method", ["paystack", "wallet", "gift_card"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (tenantId) q = q.eq("tenant_id", tenantId);

  const { data: orders, error } = await q;
  if (error || !orders?.length) return [];

  const results: AuditRow[] = [];
  for (const raw of orders as Array<Record<string, unknown>>) {
    const orderId = String(raw.id);
    const orderNumber = String(raw.order_number ?? "");
    const providerId = raw.provider_id as string | null;

    const { data: linked } = await supabase
      .from("finance_transactions")
      .select("id")
      .eq("transaction_type", "provider_earnings")
      .eq("product_order_id", orderId)
      .limit(1);
    if ((linked?.length ?? 0) > 0) continue;

    if (providerId && orderNumber) {
      const { data: legacy } = await supabase
        .from("finance_transactions")
        .select("id")
        .eq("transaction_type", "provider_earnings")
        .eq("provider_id", providerId)
        .is("product_order_id", null)
        .ilike("description", `%${orderNumber}%`)
        .limit(1);
      if ((legacy?.length ?? 0) > 0) continue;
    }

    results.push(raw);
    if (results.length >= limit) break;
  }
  return results;
}

async function queryUnsettledCancellations(
  supabase: SupabaseClient,
  tenantId: string | null,
  limit: number,
): Promise<AuditRow[]> {
  let q = supabase
    .from("bookings")
    .select(
      "id, booking_number, total_paid, wallet_amount, gift_card_amount, cancelled_at, tenant_id, cancellation_settlement_error",
    )
    .in("status", ["cancelled", "no_show"])
    .is("cancellation_settled_at", null)
    .or("total_paid.gt.0,wallet_amount.gt.0,gift_card_amount.gt.0")
    .order("cancelled_at", { ascending: false })
    .limit(limit);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q;
  if (error || !data) return [];
  return data as AuditRow[];
}

async function queryProcessingPayoutsMissingLedger(
  supabase: SupabaseClient,
  tenantId: string | null,
  limit: number,
): Promise<AuditRow[]> {
  // In-flight Paystack/Flutterwave transfers are processing by design; only a
  // Stripe transfer (synchronous) or one stuck for a day is a real gap.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let q = supabase
    .from("payouts")
    .select("id, provider_id, transfer_code, status, net_amount, payout_provider, updated_at, providers!inner(tenant_id)")
    .eq("status", "processing")
    .not("transfer_code", "is", null)
    .or(`payout_provider.eq.stripe,updated_at.lt.${dayAgo}`)
    .limit(limit);
  if (tenantId) q = q.eq("providers.tenant_id", tenantId);
  const { data, error } = await q;
  if (error || !data?.length) return [];
  const ids = (data as Array<{ id: string }>).map((r) => r.id);
  const { data: ledger } = await supabase
    .from("finance_transactions")
    .select("payout_id")
    .eq("transaction_type", "payout")
    .in("payout_id", ids);
  const covered = new Set(
    ((ledger ?? []) as Array<{ payout_id?: string }>).map((r) => String(r.payout_id)),
  );
  return (data as AuditRow[]).filter((r) => !covered.has(String(r.id)));
}

async function queryUnfinalizedRescheduleCredits(
  supabase: SupabaseClient,
  tenantId: string | null,
  limit: number,
): Promise<AuditRow[]> {
  let q = supabase
    .from("bookings")
    .select("id, booking_number, payment_status, reschedule_credit_pending, rescheduled_from_booking_id")
    .not("rescheduled_from_booking_id", "is", null)
    .is("reschedule_carry_over_finalized_at", null)
    .in("payment_status", ["paid", "partially_paid"])
    .limit(limit);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q;
  if (error || !data) return [];
  return data as AuditRow[];
}

export async function buildFinanceIntegrityReport(
  supabase: SupabaseClient,
  tenantId: string | null,
  limit: number,
): Promise<IntegrityReportPayload> {
  const tenantArg = { p_tenant_id: tenantId, p_limit: limit };

  const [
    overchargedBookings,
    vatDebitedOnRefunds,
    depositTaxLeak,
    missingOnlineLedger,
    missingProviderEarnings,
    orphanPayoutRows,
    completedPayoutsWithoutLedger,
    vatSettingsViolations,
    chargedVatWithoutRegistration,
    displayDefects,
    rateDataQuality,
    duplicateSourcePaymentRows,
    completedRefundsWithoutLedger,
    paidProductOrdersMissingLedger,
    unsettledCancellations,
    processingPayoutsMissingLedger,
    unfinalizedRescheduleCredits,
  ] = await Promise.all([
    rpcRows(supabase, "list_integrity_overcharged_inclusive_bookings", tenantArg),
    rpcRows(supabase, "list_integrity_vat_debited_on_refunds", tenantArg),
    rpcRows(supabase, "list_integrity_deposit_tax_leak", tenantArg),
    queryMissingOnlineLedger(supabase, tenantId, limit),
    rpcRows(supabase, "list_booking_payments_missing_provider_earnings", tenantArg),
    rpcRows(supabase, "list_integrity_orphan_payout_ledger_rows", tenantArg),
    rpcRows(supabase, "list_integrity_completed_payouts_without_ledger", tenantArg),
    rpcRows(supabase, "list_integrity_vat_settings_violations", tenantArg),
    rpcRows(supabase, "list_integrity_charged_vat_without_registration", tenantArg),
    rpcRows(supabase, "list_integrity_tax_rate_display_defects", tenantArg),
    rpcRows(supabase, "list_integrity_tax_rate_data_quality", tenantArg),
    queryDuplicateSourcePaymentRows(supabase, limit),
    queryCompletedRefundsWithoutLedger(supabase, tenantId, limit),
    queryPaidProductOrdersMissingLedger(supabase, tenantId, limit),
    queryUnsettledCancellations(supabase, tenantId, limit),
    queryProcessingPayoutsMissingLedger(supabase, tenantId, limit),
    queryUnfinalizedRescheduleCredits(supabase, tenantId, limit),
  ]);

  const missingLedgerLegs = [...missingOnlineLedger, ...missingProviderEarnings].slice(0, limit);

  return {
    generated_at: new Date().toISOString(),
    tenant_id: tenantId,
    limit,
    sections: {
      overcharged_bookings: section(overchargedBookings),
      vat_debited_on_refunds: section(vatDebitedOnRefunds),
      deposit_tax_leak: section(depositTaxLeak),
      missing_ledger_legs: {
        count: missingLedgerLegs.length,
        rows: missingLedgerLegs,
        details: {
          online_payments_missing_ledger: missingOnlineLedger,
          payments_missing_provider_earnings: missingProviderEarnings,
        },
      },
      orphan_payout_rows: section(orphanPayoutRows),
      completed_payouts_without_ledger: section(completedPayoutsWithoutLedger),
      vat_settings_violations: section(vatSettingsViolations),
      charged_vat_without_registration: section(chargedVatWithoutRegistration),
      display_defects: section(displayDefects),
      rate_data_quality: section(rateDataQuality),
      duplicate_source_payment_ledger_rows: section(duplicateSourcePaymentRows),
      completed_refunds_without_ledger: section(completedRefundsWithoutLedger),
      paid_product_orders_missing_ledger: section(paidProductOrdersMissingLedger),
      unsettled_cancellations: section(unsettledCancellations),
      processing_payouts_missing_ledger: section(processingPayoutsMissingLedger),
      unfinalized_reschedule_credits: section(unfinalizedRescheduleCredits),
    },
  };
}

function section(rows: AuditRow[]): IntegrityReportSection {
  return {
    count: rows.length,
    rows,
  };
}

export function integrityReportToCsv(report: IntegrityReportPayload): string {
  const lines = ["section,row_json"];
  for (const [name, block] of Object.entries(report.sections)) {
    for (const row of block.rows) {
      const escaped = JSON.stringify(row).replace(/"/g, '""');
      lines.push(`${name},"${escaped}"`);
    }
  }
  return lines.join("\r\n");
}
