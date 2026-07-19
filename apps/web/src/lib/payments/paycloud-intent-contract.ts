import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaycloudEnvironment } from "@/lib/payments/paycloud";

/** Default WiseCashier same-terminal Intent contract (override via tenant_paycloud_apps.metadata.intent_contract). */
export const DEFAULT_PAYCLOUD_INTENT_CONTRACT = {
  package_name: "com.wiseasy.cashier",
  action: "com.wiseasy.cashier.action.PAYMENT",
  merchant_order_no_key: "merchant_order_no",
  order_amount_key: "order_amount",
  currency_key: "price_currency",
  pay_scenario_key: "pay_scenario",
  pay_method_id_key: "pay_method_id",
  trans_type_key: "trans_type",
  tip_amount_key: "tip_amount",
  cashback_amount_key: "cashback_amount",
  app_id_key: "app_id",
};

export type PaycloudIntentContract = {
  package_name: string;
  action: string;
  merchant_order_no_key: string;
  order_amount_key: string;
  currency_key: string;
  pay_scenario_key: string;
  pay_method_id_key: string;
  trans_type_key: string;
  tip_amount_key: string;
  cashback_amount_key: string;
  app_id_key: string;
};

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
  const pick = (key: keyof PaycloudIntentContract): string => {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    return DEFAULT_PAYCLOUD_INTENT_CONTRACT[key];
  };
  return {
    package_name: pick("package_name"),
    action: pick("action"),
    merchant_order_no_key: pick("merchant_order_no_key"),
    order_amount_key: pick("order_amount_key"),
    currency_key: pick("currency_key"),
    pay_scenario_key: pick("pay_scenario_key"),
    pay_method_id_key: pick("pay_method_id_key"),
    trans_type_key: pick("trans_type_key"),
    tip_amount_key: pick("tip_amount_key"),
    cashback_amount_key: pick("cashback_amount_key"),
    app_id_key: pick("app_id_key"),
  };
}

export function buildSameTerminalIntentPayload(input: {
  merchantOrderNo: string;
  chargeAmount: number;
  currency: string;
  payScenario: string;
  payMethodId?: string | null;
  transType: number;
  tipAmount?: number;
  cashbackAmount?: number;
  appId: string;
  intentContract: PaycloudIntentContract;
}) {
  return {
    merchant_order_no: input.merchantOrderNo,
    order_amount: String(input.chargeAmount),
    price_currency: input.currency,
    pay_scenario: input.payScenario,
    ...(input.payMethodId ? { pay_method_id: input.payMethodId } : {}),
    trans_type: input.transType,
    ...(input.tipAmount && input.tipAmount > 0 ? { tip_amount: String(input.tipAmount) } : {}),
    ...(input.cashbackAmount && input.cashbackAmount > 0
      ? { cashback_amount: String(input.cashbackAmount) }
      : {}),
    app_id: input.appId,
    intent_contract: input.intentContract,
  };
}
