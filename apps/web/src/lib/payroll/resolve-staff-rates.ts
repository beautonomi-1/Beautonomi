export type StaffRateFields = {
  service_commission_rate?: number | null;
  product_commission_rate?: number | null;
  commission_rate?: number | null;
  commission_percentage?: number | null;
};

export type ResolvedStaffRates = {
  serviceRate: number;
  productRate: number;
};

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Canonical commission rates for payroll and ledger.
 * Prefers service_commission_rate / product_commission_rate when set (including 0).
 * Falls back to legacy commission_rate / commission_percentage.
 */
export function resolveStaffRates(staff: StaffRateFields): ResolvedStaffRates {
  const legacy =
    num(staff.commission_rate) ??
    num(staff.commission_percentage) ??
    0;

  const serviceExplicit = num(staff.service_commission_rate);
  const productExplicit = num(staff.product_commission_rate);

  const serviceRate = serviceExplicit != null ? serviceExplicit : legacy;
  const productRate = productExplicit != null ? productExplicit : legacy;

  return {
    serviceRate: Math.max(0, Math.min(100, serviceRate)),
    productRate: Math.max(0, Math.min(100, productRate)),
  };
}

/** True when DB still has legacy-only rates (migration / audit helper). */
export function hasStaleLegacyCommissionRates(staff: StaffRateFields): boolean {
  const svc = num(staff.service_commission_rate);
  const prod = num(staff.product_commission_rate);
  const legacy = num(staff.commission_rate) ?? num(staff.commission_percentage);
  if (legacy == null || legacy <= 0) return false;
  return (svc == null || svc === 0) && (prod == null || prod === 0);
}
