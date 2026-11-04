import type { SupabaseClient } from "@supabase/supabase-js";
import { getPrimaryOnlinePaymentGatewayForRegion } from "@/lib/regions/payment-gateways";
import { getTenantRegionConfig } from "@/lib/regions/config";

export type CatalogReadinessIssue = {
  kind:
    | "unlinked_pricing_card"
    | "missing_gateway_price"
    | "missing_apple_product_monthly"
    | "missing_apple_product_yearly";
  pricing_plan_id?: string;
  subscription_plan_id?: string;
  message: string;
};

export async function evaluateSubscriptionCatalogReadiness(
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<{ ok: boolean; issues: CatalogReadinessIssue[] }> {
  const issues: CatalogReadinessIssue[] = [];

  let gateway = "paystack";
  if (tenantId) {
    const region = await getTenantRegionConfig(tenantId);
    if (region?.regionId) {
      const primary = await getPrimaryOnlinePaymentGatewayForRegion(region.regionId);
      gateway = primary?.gateway?.trim().toLowerCase() || "paystack";
    }
  }

  const { data: pricingRows } = await supabase
    .from("pricing_plans")
    .select("id, name, subscription_plan_id, is_active, price, paystack_plan_code_monthly, paystack_plan_code_yearly")
    .eq("is_active", true);

  const { data: subPlans } = await supabase
    .from("subscription_plans")
    .select("id, name, is_free, is_active, price_monthly, price_yearly, paystack_plan_code_monthly, paystack_plan_code_yearly, apple_product_id_monthly, apple_product_id_yearly")
    .eq("is_active", true);

  const subById = new Map((subPlans ?? []).map((p) => [(p as { id: string }).id, p as Record<string, unknown>]));

  for (const raw of pricingRows ?? []) {
    const row = raw as {
      id: string;
      name?: string;
      subscription_plan_id?: string | null;
      price?: string;
      paystack_plan_code_monthly?: string | null;
      paystack_plan_code_yearly?: string | null;
    };
    const linkedId = row.subscription_plan_id?.trim();
    if (!linkedId) {
      const priceStr = String(row.price ?? "").replace(/[^0-9.]/g, "");
      const numeric = priceStr ? Number.parseFloat(priceStr) : 0;
      const looksFree = !priceStr || numeric === 0 || /free/i.test(String(row.price ?? ""));
      if (!looksFree) {
        issues.push({
          kind: "unlinked_pricing_card",
          pricing_plan_id: row.id,
          message: `Pricing card "${row.name ?? row.id}" is paid but not linked to a subscription plan.`,
        });
      }
      continue;
    }
    const sub = subById.get(linkedId);
    if (!sub || sub.is_free === true) continue;

    if (gateway === "paystack") {
      const hasMonthly =
        Boolean(row.paystack_plan_code_monthly) || Boolean(sub.paystack_plan_code_monthly) || Number(sub.price_monthly) > 0;
      const hasYearly =
        Boolean(row.paystack_plan_code_yearly) || Boolean(sub.paystack_plan_code_yearly) || Number(sub.price_yearly) > 0;
      if (!hasMonthly && !hasYearly) {
        issues.push({
          kind: "missing_gateway_price",
          pricing_plan_id: row.id,
          subscription_plan_id: linkedId,
          message: `Plan "${row.name ?? row.id}" has no Paystack price configured.`,
        });
      }
    }

    if (Number(sub.price_monthly) > 0 && !String(sub.apple_product_id_monthly ?? "").trim()) {
      issues.push({
        kind: "missing_apple_product_monthly",
        subscription_plan_id: linkedId,
        message: `Subscription plan "${String(sub.name ?? linkedId)}" is missing App Store product (monthly).`,
      });
    }
    if (Number(sub.price_yearly) > 0 && !String(sub.apple_product_id_yearly ?? "").trim()) {
      issues.push({
        kind: "missing_apple_product_yearly",
        subscription_plan_id: linkedId,
        message: `Subscription plan "${String(sub.name ?? linkedId)}" is missing App Store product (yearly).`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
