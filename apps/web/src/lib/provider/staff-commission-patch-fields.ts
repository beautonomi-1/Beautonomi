import { resolveStaffRates, type StaffRateFields } from "@/lib/payroll/resolve-staff-rates";

/** A single commission number updates both rates only when payroll already pays them the same. */
export function commissionRatePatch(
  incoming: number | null,
  staff: StaffRateFields,
): Record<string, unknown> {
  const rates = resolveStaffRates(staff);
  const sameRate = rates.serviceRate === rates.productRate;
  const update: Record<string, unknown> = {};
  if (incoming === null) {
    update.commission_rate = null;
    update.commission_enabled = false;
    if (sameRate) {
      update.service_commission_rate = null;
      update.product_commission_rate = null;
      update.commission_percentage = null;
    }
  } else {
    update.commission_rate = incoming;
    update.commission_enabled = true;
    if (sameRate) {
      update.service_commission_rate = incoming;
      update.product_commission_rate = incoming;
      update.commission_percentage = incoming;
    }
  }
  return update;
}
