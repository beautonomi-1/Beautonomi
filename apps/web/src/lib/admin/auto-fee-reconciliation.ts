import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeGatewayFeeSuggestions,
  feeReconciliationDateBounds,
  normalizeGatewayName,
} from "@/lib/admin/fee-reconciliation-compute";

export type AutoFeeReconciliationResult = {
  reconciliation_date: string;
  tenant_id: string;
  gateway_name: string;
  recorded_fees: number;
  expected_fees: number;
  actual_fees: number;
  variance: number;
  status: "pending" | "reviewed";
  source: "auto_daily";
  upserted: boolean;
  error?: string;
};

export type RunAutoFeeReconciliationOptions = {
  /** Inclusive YYYY-MM-DD dates. Defaults to yesterday UTC when omitted. */
  startDate?: string;
  endDate?: string;
  tenantIds?: string[];
  gateways?: string[];
  varianceReviewThreshold?: number;
};

const DEFAULT_VARIANCE_THRESHOLD = 1;

function yesterdayUtcYmd(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function eachUtcDateInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function listActiveTenantIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .neq("lifecycle", "archived");
  if (error) throw error;
  return (data ?? []).map((r) => String((r as { id: string }).id));
}

async function listConfiguredGateways(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("payment_gateway_fee_configs")
    .select("gateway_name")
    .eq("is_active", true);
  if (error) throw error;
  const names = new Set<string>();
  for (const row of data ?? []) {
    const g = normalizeGatewayName(String((row as { gateway_name?: string }).gateway_name ?? ""));
    if (g) names.add(g);
  }
  if (names.size === 0) names.add("paystack");
  return [...names];
}

export async function runAutoFeeReconciliationForDay(
  supabase: SupabaseClient,
  reconciliationDate: string,
  tenantId: string,
  gatewayName: string,
  varianceReviewThreshold = DEFAULT_VARIANCE_THRESHOLD,
): Promise<AutoFeeReconciliationResult> {
  const gateway = normalizeGatewayName(gatewayName);
  const base: AutoFeeReconciliationResult = {
    reconciliation_date: reconciliationDate,
    tenant_id: tenantId,
    gateway_name: gateway,
    recorded_fees: 0,
    expected_fees: 0,
    actual_fees: 0,
    variance: 0,
    status: "pending",
    source: "auto_daily",
    upserted: false,
  };

  try {
    const computed = await computeGatewayFeeSuggestions(
      supabase,
      gateway,
      reconciliationDate,
      reconciliationDate,
      { tenantId },
    );
    const recorded = computed.recorded_fees;
    const expected = computed.expected_fees_from_config;
    const actual = recorded;
    const variance = Math.round((actual - expected) * 100) / 100;
    const status = Math.abs(variance) < varianceReviewThreshold ? "reviewed" : "pending";

    const { error } = await supabase.from("fee_reconciliations").upsert(
      {
        reconciliation_date: reconciliationDate,
        gateway_name: gateway,
        tenant_id: tenantId,
        recorded_fees: recorded,
        expected_fees: expected,
        actual_fees: actual,
        variance,
        status,
        source: "auto_daily",
        created_by: null,
        notes: "Auto-generated from ledger-recorded Paystack fees vs fee config.",
      },
      { onConflict: "reconciliation_date,gateway_name,tenant_id" },
    );

    if (error) throw error;

    return {
      ...base,
      recorded_fees: recorded,
      expected_fees: expected,
      actual_fees: actual,
      variance,
      status,
      upserted: true,
    };
  } catch (e) {
    return {
      ...base,
      upserted: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function runAutoFeeReconciliation(
  supabase: SupabaseClient,
  opts: RunAutoFeeReconciliationOptions = {},
): Promise<{
  start_date: string;
  end_date: string;
  results: AutoFeeReconciliationResult[];
  upserted: number;
  errors: number;
}> {
  const endDate = opts.endDate ?? opts.startDate ?? yesterdayUtcYmd();
  const startDate = opts.startDate ?? endDate;
  feeReconciliationDateBounds(startDate, endDate);

  const tenantIds =
    opts.tenantIds && opts.tenantIds.length > 0
      ? opts.tenantIds
      : await listActiveTenantIds(supabase);
  const gateways =
    opts.gateways && opts.gateways.length > 0
      ? opts.gateways.map(normalizeGatewayName)
      : await listConfiguredGateways(supabase);

  const threshold = opts.varianceReviewThreshold ?? DEFAULT_VARIANCE_THRESHOLD;
  const dates = eachUtcDateInclusive(startDate, endDate);
  const results: AutoFeeReconciliationResult[] = [];

  for (const date of dates) {
    for (const tenantId of tenantIds) {
      for (const gateway of gateways) {
        results.push(
          await runAutoFeeReconciliationForDay(supabase, date, tenantId, gateway, threshold),
        );
      }
    }
  }

  return {
    start_date: startDate,
    end_date: endDate,
    results,
    upserted: results.filter((r) => r.upserted).length,
    errors: results.filter((r) => r.error).length,
  };
}
