export type LinkedSubscriptionPlanPrices = {
  subscription_plan_id: string | null;
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string | null;
};

export function buildPublicPricingBillingPeriods(input: {
  isFree: boolean;
  paystackPlanCodeMonthly?: string | null;
  paystackPlanCodeYearly?: string | null;
  linkedPriceMonthly?: number | null;
  linkedPriceYearly?: number | null;
}): ("monthly" | "yearly")[] {
  const periods: ("monthly" | "yearly")[] = [];
  if (input.paystackPlanCodeMonthly) periods.push("monthly");
  if (input.paystackPlanCodeYearly) periods.push("yearly");

  const monthlyLinked = Number(input.linkedPriceMonthly ?? 0);
  if (!input.isFree && monthlyLinked > 0 && !periods.includes("monthly")) {
    periods.push("monthly");
  }

  const yearlyLinked = Number(input.linkedPriceYearly ?? 0);
  if (!input.isFree && yearlyLinked > 0 && !periods.includes("yearly")) {
    periods.push("yearly");
  }

  if (!input.isFree && periods.length === 0) {
    periods.push("monthly");
  }

  return periods;
}

export function formatSubscriptionPlanAmount(
  amount: number,
  currency: string | null | undefined,
): string {
  const code = (currency ?? "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

export async function loadLinkedSubscriptionPlanPrices(
  supabase: { from: (table: string) => any },
  subscriptionPlanId: string | null | undefined,
): Promise<Omit<LinkedSubscriptionPlanPrices, "subscription_plan_id"> & { subscription_plan_id: string | null }> {
  const id = subscriptionPlanId?.trim() || null;
  if (!id) {
    return { subscription_plan_id: null, price_monthly: null, price_yearly: null, currency: null };
  }
  const { data } = await supabase
    .from("subscription_plans")
    .select("id, price_monthly, price_yearly, currency")
    .eq("id", id)
    .maybeSingle();
  if (!data) {
    return { subscription_plan_id: id, price_monthly: null, price_yearly: null, currency: null };
  }
  const row = data as {
    price_monthly?: number | null;
    price_yearly?: number | null;
    currency?: string | null;
  };
  return {
    subscription_plan_id: id,
    price_monthly: row.price_monthly != null ? Number(row.price_monthly) : null,
    price_yearly: row.price_yearly != null ? Number(row.price_yearly) : null,
    currency: row.currency ?? null,
  };
}

export async function loadLinkedSubscriptionPlanPricesMap(
  supabase: { from: (table: string) => any },
  subscriptionPlanIds: string[],
): Promise<Map<string, Omit<LinkedSubscriptionPlanPrices, "subscription_plan_id">>> {
  const unique = [...new Set(subscriptionPlanIds.filter(Boolean))];
  const map = new Map<string, Omit<LinkedSubscriptionPlanPrices, "subscription_plan_id">>();
  if (unique.length === 0) return map;

  const { data: rows } = await supabase
    .from("subscription_plans")
    .select("id, price_monthly, price_yearly, currency")
    .in("id", unique);

  for (const raw of rows ?? []) {
    const row = raw as {
      id: string;
      price_monthly?: number | null;
      price_yearly?: number | null;
      currency?: string | null;
    };
    map.set(row.id, {
      price_monthly: row.price_monthly != null ? Number(row.price_monthly) : null,
      price_yearly: row.price_yearly != null ? Number(row.price_yearly) : null,
      currency: row.currency ?? null,
    });
  }
  return map;
}

export function checkoutPriceDisplayForPeriod(
  plan: {
    price: string;
    price_monthly?: number | null;
    price_yearly?: number | null;
    currency?: string | null;
  },
  billingPeriod: "monthly" | "yearly",
): string {
  const linked =
    billingPeriod === "yearly"
      ? plan.price_yearly != null && plan.price_yearly > 0
        ? plan.price_yearly
        : null
      : plan.price_monthly != null && plan.price_monthly > 0
        ? plan.price_monthly
        : null;
  if (linked != null) {
    return formatSubscriptionPlanAmount(linked, plan.currency);
  }
  return plan.price;
}
