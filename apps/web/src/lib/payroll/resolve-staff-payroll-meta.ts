import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayModel, PayPlanSnapshot } from "./compute-compensation";

export type StaffPayrollMeta = {
  jurisdictionCode: string | null;
  employmentType: "employee" | "contractor" | "apprentice";
  statutoryMode: "auto" | "manual" | "none";
  payPlan: PayPlanSnapshot | null;
};

type StaffRow = {
  id: string;
  jurisdiction_code?: string | null;
  statutory_mode?: string | null;
  primary_work_location_id?: string | null;
  primary_work_location?: { jurisdiction_code?: string | null } | null;
};

type PayPlanRow = {
  staff_id: string;
  pay_model: PayModel;
  employment_type: "employee" | "contractor" | "apprentice";
  base_amount: number | null;
  hourly_rate: number | null;
  service_rate: number | null;
  product_rate: number | null;
  tier_mode: "retroactive" | "marginal";
  threshold_amount: number | null;
  tiers: unknown;
};

function planRowToSnapshot(row: PayPlanRow): PayPlanSnapshot {
  const tiersRaw = Array.isArray(row.tiers) ? row.tiers : [];
  const serviceTiers = tiersRaw
    .map((t) => {
      const o = t as { min_revenue?: number; minRevenue?: number; rate?: number; commission_rate?: number; commissionRate?: number };
      return {
        minRevenue: Number(o.min_revenue ?? o.minRevenue ?? 0),
        commissionRate: Number(o.rate ?? o.commission_rate ?? o.commissionRate ?? 0),
      };
    })
    .filter((t) => t.minRevenue >= 0);

  return {
    payModel: row.pay_model,
    baseMonthly: row.base_amount != null ? Number(row.base_amount) : undefined,
    hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : undefined,
    serviceRate: row.service_rate != null ? Number(row.service_rate) : undefined,
    productRate: row.product_rate != null ? Number(row.product_rate) : undefined,
    tierMode: row.tier_mode,
    serviceTiers: serviceTiers.length ? serviceTiers : undefined,
    thresholdAmount: row.threshold_amount != null ? Number(row.threshold_amount) : undefined,
  };
}

/**
 * Load jurisdiction, statutory mode, and effective pay plan per staff for a pay date.
 */
export async function loadStaffPayrollMetaBatch(
  admin: SupabaseClient,
  providerId: string,
  staffIds: string[],
  payDate: string,
  providerCountryFallback: string | null,
): Promise<Map<string, StaffPayrollMeta>> {
  const out = new Map<string, StaffPayrollMeta>();
  if (!staffIds.length) return out;

  const { data: staffRows } = await admin
    .from("provider_staff")
    .select(
      "id, jurisdiction_code, statutory_mode, primary_work_location_id, primary_work_location:provider_locations!primary_work_location_id(jurisdiction_code)",
    )
    .in("id", staffIds);

  const { data: planRows } = await admin
    .from("staff_pay_plans")
    .select(
      "staff_id, pay_model, employment_type, base_amount, hourly_rate, service_rate, product_rate, tier_mode, threshold_amount, tiers, effective_from, effective_to",
    )
    .eq("provider_id", providerId)
    .in("staff_id", staffIds)
    .lte("effective_from", payDate)
    .or(`effective_to.is.null,effective_to.gte.${payDate}`)
    .order("effective_from", { ascending: false });

  const planByStaff = new Map<string, PayPlanRow>();
  for (const p of (planRows ?? []) as PayPlanRow[]) {
    if (!planByStaff.has(p.staff_id)) planByStaff.set(p.staff_id, p);
  }

  for (const raw of staffRows ?? []) {
    const s = raw as StaffRow;
    const loc = s.primary_work_location as { jurisdiction_code?: string | null } | null | undefined;
    const locJurisdiction = loc?.jurisdiction_code ?? null;
    const jurisdictionCode =
      (s.jurisdiction_code?.trim() || locJurisdiction?.trim() || providerCountryFallback?.trim() || null) ??
      null;

    const statutoryRaw = (s.statutory_mode ?? "auto") as StaffPayrollMeta["statutoryMode"];
    const statutoryMode =
      statutoryRaw === "manual" || statutoryRaw === "none" || statutoryRaw === "auto"
        ? statutoryRaw
        : "auto";

    const planRow = planByStaff.get(s.id);
    const employmentType = planRow?.employment_type ?? "employee";
    const payPlan = planRow ? planRowToSnapshot(planRow) : null;

    if (employmentType === "contractor") {
      out.set(s.id, {
        jurisdictionCode,
        employmentType,
        statutoryMode: "none",
        payPlan,
      });
      continue;
    }

    out.set(s.id, {
      jurisdictionCode,
      employmentType,
      statutoryMode: statutoryMode === "auto" && !jurisdictionCode ? "manual" : statutoryMode,
      payPlan,
    });
  }

  for (const id of staffIds) {
    if (!out.has(id)) {
      out.set(id, {
        jurisdictionCode: providerCountryFallback,
        employmentType: "employee",
        statutoryMode: providerCountryFallback ? "auto" : "manual",
        payPlan: null,
      });
    }
  }

  return out;
}
