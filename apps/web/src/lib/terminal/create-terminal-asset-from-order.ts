import type { SupabaseClient } from "@supabase/supabase-js";

type CommercialModel =
  | "once_off_purchase"
  | "rental"
  | "subscription_bundle"
  | "lease_to_own"
  | "financed"
  | "promotional";

const OWNERSHIP_MAP: Record<CommercialModel, string> = {
  once_off_purchase: "provider_owned",
  rental: "rented",
  subscription_bundle: "subscription_included",
  lease_to_own: "leased",
  financed: "provider_owned",
  promotional: "platform_owned",
};

const STATUS_FROM_ORDER: Record<string, string> = {
  pending: "ordered",
  confirmed: "ordered",
  processing: "ordered",
  dispatched: "dispatched",
  delivered: "delivered",
};

export async function ensureTerminalAssetsForOrder(
  supabase: SupabaseClient,
  terminalOrderId: string,
): Promise<{ created: number; skipped: boolean }> {
  const { data: existing } = await (supabase.from("terminal_assets") as any)
    .select("id")
    .eq("order_id", terminalOrderId)
    .limit(1);

  if ((existing ?? []).length > 0) {
    return { created: 0, skipped: true };
  }

  const { data: order, error } = await (supabase.from("terminal_orders") as any)
    .select(
      "id, tenant_id, provider_id, product_id, quantity, commercial_model, order_status, total_amount, unit_price, finance_transaction_id, subscription_id, gl_inventory_account",
    )
    .eq("id", terminalOrderId)
    .maybeSingle();

  if (error || !order) {
    throw error ?? new Error("Terminal order not found");
  }

  const o = order as {
    tenant_id: string;
    provider_id: string;
    product_id?: string | null;
    quantity: number;
    commercial_model: CommercialModel;
    order_status: string;
    total_amount?: number;
    unit_price?: number;
    finance_transaction_id?: string | null;
    subscription_id?: string | null;
    gl_inventory_account?: string | null;
  };

  let assignedPlanId: string | null = null;
  if (o.commercial_model === "subscription_bundle" && o.subscription_id) {
    const { data: subRow } = await supabase
      .from("provider_subscriptions")
      .select("plan_id")
      .eq("id", o.subscription_id)
      .maybeSingle();
    assignedPlanId = (subRow as { plan_id?: string } | null)?.plan_id ?? null;
  }

  const assetStatus = STATUS_FROM_ORDER[o.order_status] ?? "ordered";
  const ownership = OWNERSHIP_MAP[o.commercial_model] ?? "provider_owned";
  const assetValue = Number(o.unit_price ?? o.total_amount ?? 0);
  const qty = Math.max(1, Number(o.quantity) || 1);

  const rows = Array.from({ length: qty }, () => ({
    tenant_id: o.tenant_id,
    provider_id: o.provider_id,
    product_id: o.product_id ?? null,
    order_id: terminalOrderId,
    status: assetStatus,
    ownership_model: ownership,
    assigned_subscription_plan_id: assignedPlanId,
    asset_value: assetValue,
    gl_asset_account: o.gl_inventory_account ?? "1200",
    finance_transaction_id: o.finance_transaction_id ?? null,
    activated_at: o.order_status === "delivered" ? new Date().toISOString() : null,
  }));

  const { error: insertErr } = await (supabase.from("terminal_assets") as any).insert(rows);
  if (insertErr) throw insertErr;

  return { created: qty, skipped: false };
}

export async function syncTerminalAssetStatusForOrder(
  supabase: SupabaseClient,
  terminalOrderId: string,
  orderStatus: string,
): Promise<void> {
  const assetStatus = STATUS_FROM_ORDER[orderStatus];
  if (!assetStatus) return;

  const updates: Record<string, unknown> = { status: assetStatus };
  if (orderStatus === "delivered") {
    updates.activated_at = new Date().toISOString();
  }

  await (supabase.from("terminal_assets") as any)
    .update(updates)
    .eq("order_id", terminalOrderId);
}
