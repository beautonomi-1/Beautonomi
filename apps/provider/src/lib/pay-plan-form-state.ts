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
  employment_start_date: string;
  employment_end_date: string;
};

/** Salary, hourly, and booth rental do not use a commission ladder. */
export function payModelUsesCommission(model: PayModelValue): boolean {
  return (
    model === "commission_only" ||
    model === "base_plus_commission" ||
    model === "base_or_commission_higher" ||
    model === "commission_above_threshold" ||
    model === "hourly_plus_commission"
  );
}

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
    employment_start_date: "",
    employment_end_date: "",
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
    base_amount:
      row.pay_model === "salary" ||
      row.pay_model === "base_plus_commission" ||
      row.pay_model === "base_or_commission_higher"
        ? Number(row.base_amount ?? base.base_amount)
        : 0,
    hourly_rate:
      row.pay_model === "hourly" || row.pay_model === "hourly_plus_commission"
        ? Number(row.hourly_rate ?? base.hourly_rate)
        : 0,
    service_rate:
      row.pay_model === "hourly" || row.pay_model === "salary" || row.pay_model === "booth_renter"
        ? 0
        : Number(row.service_rate ?? base.service_rate),
    product_rate:
      row.pay_model === "hourly" || row.pay_model === "salary" || row.pay_model === "booth_renter"
        ? 0
        : Number(row.product_rate ?? base.product_rate),
    threshold_amount:
      row.pay_model === "commission_above_threshold"
        ? Number(row.threshold_amount ?? base.threshold_amount)
        : 0,
    tier_mode: (row.tier_mode as PayPlanFormState["tier_mode"]) ?? base.tier_mode,
    employment_start_date:
      typeof row.employment_start_date === "string" ? row.employment_start_date.slice(0, 10) : "",
    employment_end_date:
      typeof row.employment_end_date === "string" ? row.employment_end_date.slice(0, 10) : "",
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
    base_amount:
      plan.pay_model === "salary" ||
      plan.pay_model === "base_plus_commission" ||
      plan.pay_model === "base_or_commission_higher"
        ? plan.base_amount
        : null,
    hourly_rate:
      plan.pay_model === "hourly" || plan.pay_model === "hourly_plus_commission"
        ? plan.hourly_rate
        : null,
    service_rate:
      plan.pay_model === "hourly" || plan.pay_model === "salary" || plan.pay_model === "booth_renter"
        ? null
        : plan.service_rate,
    product_rate:
      plan.pay_model === "hourly" || plan.pay_model === "salary" || plan.pay_model === "booth_renter"
        ? null
        : plan.product_rate,
    threshold_amount:
      plan.pay_model === "commission_above_threshold" ? plan.threshold_amount : null,
    tier_mode: plan.tier_mode,
    employment_start_date: plan.employment_start_date || null,
    employment_end_date: plan.employment_end_date || null,
    tiers,
  };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function payPlanDateError(plan: PayPlanFormState): string | null {
  const start = plan.employment_start_date.trim();
  const end = plan.employment_end_date.trim();
  if (start && !YMD.test(start)) return "Employment start must be YYYY-MM-DD.";
  if (end && !YMD.test(end)) return "Employment end must be YYYY-MM-DD.";
  if (start && end && end < start) return "Employment end date is before the start date.";
  return null;
}

export function staffMoneyFromPayPlan(plan: PayPlanFormState): {
  commission_enabled: boolean;
  service_commission_rate: number;
  product_commission_rate: number;
  hourly_rate: number;
  salary: number;
} {
  const usesCommission = [
    "commission_only",
    "base_plus_commission",
    "base_or_commission_higher",
    "commission_above_threshold",
    "hourly_plus_commission",
  ].includes(plan.pay_model);
  const usesHourly = plan.pay_model === "hourly" || plan.pay_model === "hourly_plus_commission";
  const usesSalary =
    plan.pay_model === "salary" ||
    plan.pay_model === "base_plus_commission" ||
    plan.pay_model === "base_or_commission_higher";
  return {
    commission_enabled: usesCommission,
    service_commission_rate: usesCommission ? plan.service_rate : 0,
    product_commission_rate: usesCommission ? plan.product_rate : 0,
    hourly_rate: usesHourly ? plan.hourly_rate : 0,
    salary: usesSalary ? plan.base_amount : 0,
  };
}
