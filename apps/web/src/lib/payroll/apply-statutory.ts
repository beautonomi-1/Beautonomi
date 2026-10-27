import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadPublishedRuleSets,
  resolveJurisdictionStatutory,
} from "./jurisdictions/resolve-statutory";
import type { PayRunItem, PayPeriodType } from "./pay-run-engine";
import { computeNetPay } from "./net-pay";
import { periodsPerYearFromPeriodType } from "./periods-per-year";

function ageFromDob(dob: string | null | undefined, payDate: string): number | undefined {
  if (!dob) return undefined;
  const birth = new Date(dob);
  const pay = new Date(payDate);
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(pay.getTime())) return undefined;
  let age = pay.getFullYear() - birth.getFullYear();
  const m = pay.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && pay.getDate() < birth.getDate())) age -= 1;
  return age;
}

async function loadYtdTaxableByStaff(
  admin: SupabaseClient,
  providerId: string,
  staffIds: string[],
  periodStart: string,
  taxYearStart: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!staffIds.length) return out;

  const windowStart = periodStart > taxYearStart ? taxYearStart : periodStart;

  const { data: runs } = await admin
    .from("provider_pay_runs")
    .select("id, pay_period_start, pay_period_end")
    .eq("provider_id", providerId)
    .in("status", ["approved", "paid"])
    .gte("pay_period_end", windowStart)
    .lt("pay_period_end", periodStart);

  const runIds = (runs ?? []).map((r: { id: string }) => r.id);
  if (!runIds.length) return out;

  const { data: rows } = await admin
    .from("provider_pay_run_items")
    .select("staff_id, taxable_income, gross_pay, uif_contribution")
    .in("pay_run_id", runIds)
    .in("staff_id", staffIds);

  for (const row of rows ?? []) {
    const sid = (row as { staff_id: string }).staff_id;
    const taxable =
      (row as { taxable_income?: number | null }).taxable_income != null
        ? Number((row as { taxable_income?: number }).taxable_income)
        : Math.max(
            0,
            Number((row as { gross_pay?: number }).gross_pay ?? 0) -
              Number((row as { uif_contribution?: number }).uif_contribution ?? 0),
          );
    out.set(sid, (out.get(sid) ?? 0) + taxable);
  }
  return out;
}

export async function applyStatutoryToPayRunItems(
  admin: SupabaseClient,
  providerId: string,
  payDate: string,
  periodType: PayPeriodType,
  items: PayRunItem[],
  staffMeta: Map<
    string,
    {
      jurisdictionCode: string;
      employmentType: "employee" | "contractor" | "apprentice";
      statutoryMode: "auto" | "manual" | "none";
      userId?: string | null;
    }
  >,
): Promise<PayRunItem[]> {
  const jurisdictionCodes = [...new Set([...staffMeta.values()].map((m) => m.jurisdictionCode))];
  const rulesByJurisdiction = new Map<string, Awaited<ReturnType<typeof loadPublishedRuleSets>>>();
  for (const code of jurisdictionCodes) {
    if (!code) continue;
    rulesByJurisdiction.set(code, await loadPublishedRuleSets(admin, code, payDate));
  }

  const staffIds = items.map((i) => i.staffId);
  const taxYearStart = `${payDate.slice(0, 4)}-03-01`;
  const ytdByStaff = await loadYtdTaxableByStaff(
    admin,
    providerId,
    staffIds,
    payDate,
    taxYearStart,
  );

  const userIds = [...staffMeta.values()]
    .map((m) => m.userId)
    .filter((id): id is string => Boolean(id));
  const dobByUser = new Map<string, string>();
  if (userIds.length) {
    const { data: users } = await admin.from("users").select("id, date_of_birth").in("id", userIds);
    for (const u of users ?? []) {
      const row = u as { id: string; date_of_birth?: string | null };
      if (row.date_of_birth) dobByUser.set(row.id, row.date_of_birth);
    }
  }

  const periodOverride = periodsPerYearFromPeriodType(periodType);

  return items.map((item) => {
    const meta = staffMeta.get(item.staffId);
    if (!meta?.jurisdictionCode || meta.statutoryMode === "none") return item;

    const rules = rulesByJurisdiction.get(meta.jurisdictionCode) ?? [];
    const ageYears = meta.userId ? ageFromDob(dobByUser.get(meta.userId), payDate) : undefined;
    const ytdTaxable = ytdByStaff.get(item.staffId) ?? 0;

    const statutory = resolveJurisdictionStatutory(
      {
        jurisdictionCode: meta.jurisdictionCode,
        payDate,
        periodGross: item.grossPay,
        ytdTaxable,
        employmentType: meta.employmentType,
        statutoryMode: meta.statutoryMode,
        ageYears,
        periodsPerYearOverride: periodOverride,
      },
      rules,
    );

    if (statutory.mode === "manual") {
      return item;
    }

    let tax = 0;
    let uif = 0;
    let taxableIncome: number | undefined;
    for (const line of statutory.lines) {
      if (line.code.startsWith("paye")) tax += line.amount;
      if (line.code.startsWith("uif")) uif += line.amount;
      if (line.code === "taxable_income") taxableIncome = line.amount;
    }
    if (taxableIncome == null) {
      taxableIncome = Math.max(0, item.grossPay - uif);
    }

    const net = computeNetPay({
      grossPay: item.grossPay,
      manualDeductions: item.manualDeductions,
      taxDeduction: tax,
      uifContribution: uif,
      carryForwardBalance:
        item.carryForwardIn != null && item.carryForwardIn > 0
          ? -item.carryForwardIn
          : undefined,
    });

    return {
      ...item,
      taxDeduction: tax,
      uifContribution: uif,
      taxableIncome,
      netPay: net.netPay,
      carryForwardOut:
        net.nextCarryForward !== 0
          ? Math.abs(net.nextCarryForward)
          : item.carryForwardOut,
    };
  });
}
