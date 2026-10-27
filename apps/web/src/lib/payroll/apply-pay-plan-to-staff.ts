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

/** Mirror effective plan onto legacy provider_staff columns used outside pay runs. */
export function providerStaffPatchFromPayPlan(
  body: PayPlanStaffSyncInput,
): Record<string, unknown> {
  const model = body.pay_model;
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.employment_type) {
    patch.employment_type = body.employment_type;
  }

  if (model === "booth_renter") {
    patch.commission_enabled = false;
    return patch;
  }

  const usesCommission = COMMISSION_MODELS.includes(model);
  patch.commission_enabled = usesCommission;

  if (usesCommission) {
    if (body.service_rate != null) patch.service_commission_rate = body.service_rate;
    if (body.product_rate != null) patch.product_commission_rate = body.product_rate;
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
