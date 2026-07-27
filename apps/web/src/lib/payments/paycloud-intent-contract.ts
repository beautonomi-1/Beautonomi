import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaycloudEnvironment } from "@/lib/payments/paycloud";

/** Official WiseCashier same-terminal Intent contract per PayCloud SameTerminalAppIntegration. */
export const PAYCLOUD_INTENT_VERSION = "A01";
export const PAYCLOUD_INTENT_ACTION = "com.wiseasy.transaction.call";
export const PAYCLOUD_WISECASHIER_PACKAGE = "com.wiseasy.cashier";

export type PaycloudSameTerminalTransType = "PRE-INIT" | "SALE" | "CASHBACK" | "REFUND";

export type PaycloudSameTerminalPaymentScenario = "CARD" | "SCANQR" | "BSCANQR" | "CASH";

/** Override via tenant_paycloud_apps.metadata.intent_contract */
export type PaycloudIntentContract = {
  package_name?: string;
  action?: string;
  version_key?: string;
  app_id_key?: string;
  trans_type_key?: string;
  trans_data_key?: string;
};

export const DEFAULT_PAYCLOUD_INTENT_CONTRACT: Required<PaycloudIntentContract> = {
  package_name: PAYCLOUD_WISECASHIER_PACKAGE,
  action: PAYCLOUD_INTENT_ACTION,
  version_key: "version",
  app_id_key: "appId",
  trans_type_key: "transType",
  trans_data_key: "transData",
};

export type PaycloudSameTerminalTransData = {
  businessOrderNo: string;
  paymentScenario: PaycloudSameTerminalPaymentScenario;
  amt: string;
  tipAmount?: string;
  cashAmount?: string;
  paymentMethod?: string;
  notifyUrl?: string;
  POSMode?: string;
  note?: string;
};

export type PaycloudIntentPayload = {
  version: string;
  appId: string;
  transType: PaycloudSameTerminalTransType;
  transData: PaycloudSameTerminalTransData;
  intent_contract?: PaycloudIntentContract;
};

/** Convert major currency units (e.g. ZAR rands) to zero-padded cents string (12 chars). */
export function formatPaycloudIntentAmountCents(amountMajor: number): string {
  const cents = Math.round(amountMajor * 100);
  return Math.max(0, cents).toString().padStart(12, "0");
}

/** Map Cloud Mode pay_scenario values to same-terminal paymentScenario. */
export function mapCloudScenarioToSameTerminal(scenario: string): PaycloudSameTerminalPaymentScenario {
  const normalized = scenario.trim().toUpperCase();
  if (normalized === "BSCANQR_PAY" || normalized === "BSCANQR") return "BSCANQR";
  if (normalized === "SCANQR_PAY" || normalized === "SCANQR") return "SCANQR";
  if (normalized === "CASH") return "CASH";
  return "CARD";
}

export function resolveSameTerminalTransType(input: {
  cashbackAmount?: number;
}): PaycloudSameTerminalTransType {
  if (input.cashbackAmount && input.cashbackAmount > 0) return "CASHBACK";
  return "SALE";
}

export async function resolvePaycloudIntentContract(
  supabase: SupabaseClient,
  params: {
    environment: PaycloudEnvironment;
    tenantId: string | null;
    paycloudAppId?: string | null;
  },
): Promise<PaycloudIntentContract> {
  const rows: Array<{ metadata?: Record<string, unknown> | null }> = [];

  if (params.paycloudAppId) {
    const { data } = await supabase
      .from("tenant_paycloud_apps")
      .select("metadata")
      .eq("id", params.paycloudAppId)
      .maybeSingle();
    if (data) rows.push(data as { metadata?: Record<string, unknown> | null });
  }

  if (params.tenantId) {
    const { data } = await supabase
      .from("tenant_paycloud_apps")
      .select("metadata")
      .eq("tenant_id", params.tenantId)
      .eq("environment", params.environment)
      .eq("is_enabled", true)
      .maybeSingle();
    if (data) rows.push(data as { metadata?: Record<string, unknown> | null });
  }

  const { data: globalApp } = await supabase
    .from("tenant_paycloud_apps")
    .select("metadata")
    .is("tenant_id", null)
    .eq("environment", params.environment)
    .eq("is_enabled", true)
    .maybeSingle();
  if (globalApp) rows.push(globalApp as { metadata?: Record<string, unknown> | null });

  for (const row of rows) {
    const override = row.metadata?.intent_contract;
    if (override && typeof override === "object" && !Array.isArray(override)) {
      return mergeIntentContract(override as Record<string, unknown>);
    }
  }

  return { ...DEFAULT_PAYCLOUD_INTENT_CONTRACT };
}

function mergeIntentContract(raw: Record<string, unknown>): PaycloudIntentContract {
  const pick = (key: keyof Required<PaycloudIntentContract>): string => {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    return DEFAULT_PAYCLOUD_INTENT_CONTRACT[key];
  };
  return {
    package_name: pick("package_name"),
    action: pick("action"),
    version_key: pick("version_key"),
    app_id_key: pick("app_id_key"),
    trans_type_key: pick("trans_type_key"),
    trans_data_key: pick("trans_data_key"),
  };
}

export function buildSameTerminalIntentPayload(input: {
  merchantOrderNo: string;
  chargeAmount: number;
  payScenario: string;
  payMethodId?: string | null;
  transType?: PaycloudSameTerminalTransType;
  tipAmount?: number;
  cashbackAmount?: number;
  appId: string;
  notifyUrl?: string;
  intentContract?: PaycloudIntentContract;
}): PaycloudIntentPayload {
  const transType = input.transType ?? resolveSameTerminalTransType({ cashbackAmount: input.cashbackAmount });
  const paymentScenario = mapCloudScenarioToSameTerminal(input.payScenario);

  const transData: PaycloudSameTerminalTransData = {
    businessOrderNo: input.merchantOrderNo,
    paymentScenario,
    amt: formatPaycloudIntentAmountCents(input.chargeAmount),
    POSMode: "1",
  };

  if (input.tipAmount && input.tipAmount > 0) {
    transData.tipAmount = formatPaycloudIntentAmountCents(input.tipAmount);
  }
  if (transType === "CASHBACK" && input.cashbackAmount && input.cashbackAmount > 0) {
    transData.cashAmount = formatPaycloudIntentAmountCents(input.cashbackAmount);
  }
  if (input.payMethodId && (paymentScenario === "BSCANQR" || paymentScenario === "SCANQR")) {
    transData.paymentMethod = input.payMethodId;
  }
  if (input.notifyUrl) {
    transData.notifyUrl = input.notifyUrl;
  }

  return {
    version: PAYCLOUD_INTENT_VERSION,
    appId: input.appId,
    transType,
    transData,
    intent_contract: input.intentContract ?? DEFAULT_PAYCLOUD_INTENT_CONTRACT,
  };
}
