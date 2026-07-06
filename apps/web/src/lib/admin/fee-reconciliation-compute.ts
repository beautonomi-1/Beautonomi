import type { SupabaseClient } from "@supabase/supabase-js";

export type FeeAutoComputeResult = {
  recorded_fees: number;
  expected_fees_from_config: number;
  charge_count: number;
  payout_transfer_count: number;
};

export type FeeAutoComputeError = {
  code: string;
  message: string;
};

export type ComputeGatewayFeeSuggestionsOptions = {
  tenantId?: string | null;
  /** YYYY-MM-DD — used for historical config lookup (defaults to endDate). */
  asOfDate?: string | null;
};

const CHARGE_STATUSES = ["success"] as const;

export const LEDGER_FEE_TYPES = [
  "payment",
  "additional_charge_payment",
  "terminal_sale",
  "terminal_rental",
  "terminal_bundle_alloc",
  "terminal_promotion",
  "provider_subscription_payment",
  "provider_ads_payment",
  "provider_marketing_credit_topup",
  "gift_card_sale",
  "wallet_topup",
  "membership_sale",
] as const;

const BOOKING_LEDGER_FEE_TYPES = new Set<string>(["payment", "additional_charge_payment"]);

/** Platform-held flows that settle via Paystack when no booking_payment link exists. */
const PLATFORM_PAYSTACK_LEDGER_TYPES = new Set<string>([
  "provider_subscription_payment",
  "provider_ads_payment",
  "provider_marketing_credit_topup",
  "gift_card_sale",
  "wallet_topup",
  "membership_sale",
  "terminal_sale",
  "terminal_rental",
  "terminal_bundle_alloc",
  "terminal_promotion",
]);

type LedgerFeeRow = {
  source_payment_id?: string | null;
  booking_id?: string | null;
  provider_id?: string | null;
  transaction_type?: string;
  amount?: number | null;
  fees?: number | null;
  metadata?: Record<string, unknown> | null;
};

/** Inclusive calendar-date range → ISO bounds on created_at. */
export function feeReconciliationDateBounds(startDate: string, endDate: string): {
  startIso: string;
  endIso: string;
} {
  const start = startDate.trim();
  const end = endDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error("start_date and end_date must be YYYY-MM-DD");
  }
  if (start > end) {
    throw new Error("start_date must be on or before end_date");
  }
  return {
    startIso: `${start}T00:00:00.000Z`,
    endIso: `${end}T23:59:59.999Z`,
  };
}

export function normalizeGatewayName(gateway: string): string {
  return gateway.trim().toLowerCase();
}

async function rpcExpectedFee(
  supabase: SupabaseClient,
  gatewayName: string,
  amount: number,
  feeScope: "transaction" | "transfer" | "payout",
  asOfDate?: string | null,
): Promise<number> {
  const rpcArgs: Record<string, unknown> = {
    gateway_name_param: gatewayName,
    transaction_amount: amount,
    currency_param: "ZAR",
    payment_method_param: "*",
    region_param: "local",
    fee_scope_param: feeScope,
  };
  if (asOfDate) {
    rpcArgs.as_of_date_param = asOfDate;
  }
  const { data, error } = await supabase.rpc("calculate_expected_fee", rpcArgs);
  if (error) throw error;
  return Number(data ?? 0);
}

function feeScopeForLedgerType(transactionType: string): "transaction" | "transfer" {
  return transactionType === "payout" ? "transfer" : "transaction";
}

function metadataReference(row: LedgerFeeRow): string | null {
  const m = row.metadata;
  if (!m || typeof m !== "object") return null;
  const ref = m.reference ?? m.paystack_reference;
  return typeof ref === "string" && ref.trim() ? ref.trim() : null;
}

async function loadGatewayMapsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  rows: LedgerFeeRow[],
): Promise<{
  sourcePaymentGateway: Map<string, string>;
  bookingGateway: Map<string, string>;
  referenceGateway: Map<string, string>;
}> {
  const sourcePaymentIds = [
    ...new Set(
      rows
        .map((r) => r.source_payment_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const bookingIds = [
    ...new Set(
      rows
        .map((r) => r.booking_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const references = [
    ...new Set(rows.map(metadataReference).filter((r): r is string => Boolean(r))),
  ];

  const sourcePaymentGateway = new Map<string, string>();
  if (sourcePaymentIds.length > 0) {
    const { data: bpRows } = await supabase
      .from("booking_payments")
      .select("id, payment_provider")
      .eq("tenant_id", tenantId)
      .in("id", sourcePaymentIds);
    for (const row of bpRows ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      const provider = String((row as { payment_provider?: string }).payment_provider ?? "");
      if (id && provider) sourcePaymentGateway.set(id, normalizeGatewayName(provider));
    }
  }

  const bookingGateway = new Map<string, string>();
  if (bookingIds.length > 0) {
    const { data: bpByBooking } = await supabase
      .from("booking_payments")
      .select("booking_id, payment_provider, status")
      .eq("tenant_id", tenantId)
      .in("booking_id", bookingIds)
      .in("status", ["completed", "partially_refunded"]);
    for (const row of bpByBooking ?? []) {
      const bookingId = String((row as { booking_id?: string }).booking_id ?? "");
      const provider = String((row as { payment_provider?: string }).payment_provider ?? "");
      if (!bookingId || !provider) continue;
      const gateway = normalizeGatewayName(provider);
      if (gateway === "wallet" || gateway === "gift_card" || gateway === "cash") continue;
      if (!bookingGateway.has(bookingId)) {
        bookingGateway.set(bookingId, gateway);
      }
    }
  }

  const referenceGateway = new Map<string, string>();
  if (references.length > 0) {
    const { data: ptRows } = await supabase
      .from("payment_transactions")
      .select("reference, provider")
      .in("reference", references)
      .in("status", [...CHARGE_STATUSES]);
    for (const row of ptRows ?? []) {
      const ref = String((row as { reference?: string }).reference ?? "");
      const provider = String((row as { provider?: string }).provider ?? "");
      if (ref && provider) referenceGateway.set(ref, normalizeGatewayName(provider));
    }
  }

  if (bookingIds.length > 0) {
    const { data: ptByBooking } = await supabase
      .from("payment_transactions")
      .select("booking_id, provider")
      .in("booking_id", bookingIds)
      .in("status", [...CHARGE_STATUSES]);
    for (const row of ptByBooking ?? []) {
      const bookingId = String((row as { booking_id?: string }).booking_id ?? "");
      const provider = String((row as { provider?: string }).provider ?? "");
      if (!bookingId || !provider || bookingGateway.has(bookingId)) continue;
      bookingGateway.set(bookingId, normalizeGatewayName(provider));
    }
  }

  return { sourcePaymentGateway, bookingGateway, referenceGateway };
}

export function resolveLedgerRowGateway(
  row: LedgerFeeRow,
  targetGateway: string,
  maps: {
    sourcePaymentGateway: Map<string, string>;
    bookingGateway: Map<string, string>;
    referenceGateway: Map<string, string>;
  },
): boolean {
  const txType = String(row.transaction_type ?? "");

  if (txType === "payout") {
    return targetGateway === "paystack";
  }

  if (row.source_payment_id) {
    const g = maps.sourcePaymentGateway.get(row.source_payment_id);
    if (g) return g === targetGateway;
  }

  const ref = metadataReference(row);
  if (ref) {
    const g = maps.referenceGateway.get(ref);
    if (g) return g === targetGateway;
  }

  if (row.booking_id && BOOKING_LEDGER_FEE_TYPES.has(txType)) {
    const g = maps.bookingGateway.get(row.booking_id);
    if (g) return g === targetGateway;
  }

  if (PLATFORM_PAYSTACK_LEDGER_TYPES.has(txType) && row.provider_id) {
    return targetGateway === "paystack";
  }

  return false;
}

async function computeFromFinanceLedger(
  supabase: SupabaseClient,
  gatewayName: string,
  startIso: string,
  endIso: string,
  tenantId: string,
  asOfDate?: string | null,
): Promise<FeeAutoComputeResult> {
  const { data: ledgerRows, error: ledgerErr } = await supabase
    .from("finance_transactions")
    .select(
      "source_payment_id, booking_id, provider_id, amount, fees, transaction_type, metadata",
    )
    .eq("tenant_id", tenantId)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (ledgerErr) throw ledgerErr;

  const rows = (ledgerRows ?? []) as LedgerFeeRow[];
  const gatewayMaps = await loadGatewayMapsForTenant(supabase, tenantId, rows);

  let recordedFees = 0;
  let expectedFromConfig = 0;
  let chargeCount = 0;
  let payoutTransferCount = 0;

  for (const row of rows) {
    if (!resolveLedgerRowGateway(row, gatewayName, gatewayMaps)) continue;

    const txType = String(row.transaction_type ?? "");
    const fees = Math.abs(Number(row.fees ?? 0));
    const amount = Math.abs(Number(row.amount ?? 0));

    if (txType === "payout") {
      if (fees <= 0) continue;
      payoutTransferCount += 1;
      recordedFees += fees;
      expectedFromConfig += await rpcExpectedFee(supabase, gatewayName, amount, "transfer", asOfDate);
      continue;
    }

    if (!LEDGER_FEE_TYPES.includes(txType as (typeof LEDGER_FEE_TYPES)[number])) continue;
    if (fees <= 0 && amount <= 0) continue;

    chargeCount += 1;
    recordedFees += fees;
    expectedFromConfig += await rpcExpectedFee(
      supabase,
      gatewayName,
      amount,
      feeScopeForLedgerType(txType),
      asOfDate,
    );
  }

  return {
    recorded_fees: Math.round(recordedFees * 100) / 100,
    expected_fees_from_config: Math.round(expectedFromConfig * 100) / 100,
    charge_count: chargeCount,
    payout_transfer_count: payoutTransferCount,
  };
}

/**
 * Suggest expected vs ledger-recorded gateway fees for a gateway + date range.
 *
 * When tenantId is set, uses finance_transactions (tenant-scoped ledger truth).
 * Otherwise uses payment_transactions + platform payout rows (legacy platform-wide).
 */
export async function computeGatewayFeeSuggestions(
  supabase: SupabaseClient,
  gatewayName: string,
  startDate: string,
  endDate: string,
  options: ComputeGatewayFeeSuggestionsOptions = {},
): Promise<FeeAutoComputeResult> {
  const gateway = normalizeGatewayName(gatewayName);
  if (!gateway) {
    throw new Error("gateway is required");
  }

  const { startIso, endIso } = feeReconciliationDateBounds(startDate, endDate);
  const tenantId = options.tenantId?.trim() || null;
  const asOfDate = options.asOfDate?.trim() || endDate;

  if (tenantId) {
    return computeFromFinanceLedger(
      supabase,
      gateway,
      startIso,
      endIso,
      tenantId,
      asOfDate,
    );
  }

  const { data: chargeRows, error: chargeErr } = await supabase
    .from("payment_transactions")
    .select("amount, fees")
    .eq("provider", gateway)
    .in("status", [...CHARGE_STATUSES])
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (chargeErr) throw chargeErr;

  let recordedFees = 0;
  let expectedFromConfig = 0;
  const charges = chargeRows ?? [];

  for (const row of charges) {
    const amount = Math.abs(Number((row as { amount?: number }).amount ?? 0));
    const fees = Math.abs(Number((row as { fees?: number }).fees ?? 0));
    recordedFees += fees;
    expectedFromConfig += await rpcExpectedFee(
      supabase,
      gateway,
      amount,
      "transaction",
      asOfDate,
    );
  }

  let payoutTransferCount = 0;

  if (gateway === "paystack") {
    const { data: payoutRows, error: payoutErr } = await supabase
      .from("finance_transactions")
      .select("amount, fees")
      .eq("transaction_type", "payout")
      .gte("created_at", startIso)
      .lte("created_at", endIso);

    if (payoutErr) throw payoutErr;

    for (const row of payoutRows ?? []) {
      const transferFee = Math.abs(Number((row as { fees?: number }).fees ?? 0));
      if (transferFee <= 0) continue;
      payoutTransferCount += 1;
      recordedFees += transferFee;
      const amount = Math.abs(Number((row as { amount?: number }).amount ?? 0));
      expectedFromConfig += await rpcExpectedFee(
        supabase,
        gateway,
        amount,
        "transfer",
        asOfDate,
      );
    }
  }

  return {
    recorded_fees: Math.round(recordedFees * 100) / 100,
    expected_fees_from_config: Math.round(expectedFromConfig * 100) / 100,
    charge_count: charges.length,
    payout_transfer_count: payoutTransferCount,
  };
}
