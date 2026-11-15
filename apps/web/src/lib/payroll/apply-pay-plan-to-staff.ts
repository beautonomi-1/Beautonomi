import type { PayModel } from "./compute-compensation";

export type PayPlanStaffSyncInput = {
  pay_model: PayModel;
  employment_type?: "employee" | "contractor" | "apprentice";
  base_amount?: number | null;
  hourly_rate?: number | null;
  service_rate?: number | null;
  product_rate?: number | null;
};

const COMMISSION_MODELS: PayModel[] = [
  "commission_only",
  "base_plus_commission",
  "base_or_commission_higher",
  "commission_above_threshold",
  "hourly_plus_commission",
];

/** Amounts stored on the plan. A commission-only plan does not keep a salary or hourly rate. */
export function payPlanStoredAmounts(
  body: PayPlanStaffSyncInput & { threshold_amount?: number | null },
): {
  base_amount: number | null;
  hourly_rate: number | null;
  service_rate: number | null;
  product_rate: number | null;
  threshold_amount: number | null;
} {
  const model = body.pay_model;
  const usesCommission = COMMISSION_MODELS.includes(model);
  const usesHourly = model === "hourly" || model === "hourly_plus_commission";
  const usesSalary =
    model === "salary" ||
    model === "base_plus_commission" ||
    model === "base_or_commission_higher";
  return {
    base_amount: usesSalary ? (body.base_amount ?? null) : null,
    hourly_rate: usesHourly ? (body.hourly_rate ?? null) : null,
    service_rate: usesCommission ? (body.service_rate ?? null) : null,
    product_rate: usesCommission ? (body.product_rate ?? null) : null,
    threshold_amount:
      model === "commission_above_threshold" ? (body.threshold_amount ?? null) : null,
  };
}

/** Mirror effective plan onto legacy provider_staff columns used outside pay runs. */
export function providerStaffPatchFromPayPlan(
  body: PayPlanStaffSyncInput,
): Record<string, unknown> {
  const model = body.pay_model;
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (model === "booth_renter") {
    patch.commission_enabled = false;
    patch.hourly_rate = 0;
    patch.salary = 0;
    patch.service_commission_rate = 0;
    patch.product_commission_rate = 0;
    return patch;
  }

  const usesCommission = COMMISSION_MODELS.includes(model);
  patch.commission_enabled = usesCommission;

  if (usesCommission) {
    if (body.service_rate != null) patch.service_commission_rate = body.service_rate;
    if (body.product_rate != null) patch.product_commission_rate = body.product_rate;
  } else {
    patch.service_commission_rate = 0;
    patch.product_commission_rate = 0;
  }

  if (model === "hourly" || model === "hourly_plus_commission") {
    if (body.hourly_rate != null) patch.hourly_rate = body.hourly_rate;
  } else {
    patch.hourly_rate = 0;
  }

  if (
    model === "salary" ||
    model === "base_plus_commission" ||
    model === "base_or_commission_higher"
  ) {
    if (body.base_amount != null) patch.salary = body.base_amount;
  } else {
    patch.salary = 0;
  }

  return patch;
}
