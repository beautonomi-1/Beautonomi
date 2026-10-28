export type PayModelValue =
  | "commission_only"
  | "base_plus_commission"
  | "base_or_commission_higher"
  | "commission_above_threshold"
  | "hourly"
  | "hourly_plus_commission"
  | "salary"
  | "booth_renter";

export type PayPlanFormState = {
  pay_model: PayModelValue;
  employment_type: "employee" | "contractor" | "apprentice";
  statutory_mode: "auto" | "manual" | "none";
  effective_from: string;
  base_amount: number;
  hourly_rate: number;
  service_rate: number;
  product_rate: number;
  threshold_amount: number;
  tier_mode: "retroactive" | "marginal";
};

export function defaultPayPlanFormState(): PayPlanFormState {
  return {
    pay_model: "commission_only",
    employment_type: "employee",
    statutory_mode: "auto",
    effective_from: new Date().toISOString().slice(0, 10),
    base_amount: 0,
    hourly_rate: 0,
    service_rate: 0,
    product_rate: 0,
    threshold_amount: 0,
    tier_mode: "retroactive",
  };
}

export function payPlanFromApiRow(
  row: Record<string, unknown> | undefined,
  fallbacks?: Partial<PayPlanFormState>,
): PayPlanFormState {
  const base = { ...defaultPayPlanFormState(), ...fallbacks };
  if (!row) return base;
  return {
    pay_model: (row.pay_model as PayModelValue) ?? base.pay_model,
    employment_type:
      (row.employment_type as PayPlanFormState["employment_type"]) ?? base.employment_type,
    statutory_mode:
      (row.statutory_mode as PayPlanFormState["statutory_mode"]) ?? base.statutory_mode,
    effective_from: String(row.effective_from ?? base.effective_from),
    base_amount: Number(row.base_amount ?? base.base_amount),
    hourly_rate: Number(row.hourly_rate ?? base.hourly_rate),
    service_rate: Number(row.service_rate ?? base.service_rate),
    product_rate: Number(row.product_rate ?? base.product_rate),
    threshold_amount: Number(row.threshold_amount ?? base.threshold_amount),
    tier_mode: (row.tier_mode as PayPlanFormState["tier_mode"]) ?? base.tier_mode,
  };
}

export function payPlanToPostBody(
  plan: PayPlanFormState,
  tiers: { min_revenue: number; commission_rate: number; tier_order?: number }[],
) {
  return {
    effective_from: plan.effective_from,
    pay_model: plan.pay_model,
    employment_type: plan.employment_type,
    statutory_mode: plan.statutory_mode,
    base_amount: plan.base_amount || null,
    hourly_rate: plan.hourly_rate || null,
    service_rate: plan.service_rate || null,
    product_rate: plan.product_rate || null,
    threshold_amount: plan.threshold_amount || null,
    tier_mode: plan.tier_mode,
    tiers,
  };
}
