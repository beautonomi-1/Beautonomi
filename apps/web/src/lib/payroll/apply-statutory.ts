import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadPublishedRuleSets,
  resolveJurisdictionStatutory,
} from "./jurisdictions/resolve-statutory";
import type { PayRunItem } from "./pay-run-engine";
import { computeNetPay } from "./net-pay";

export async function applyStatutoryToPayRunItems(
  admin: SupabaseClient,
  providerId: string,
  payDate: string,
  items: PayRunItem[],
  staffMeta: Map<
    string,
    {
      jurisdictionCode: string;
      employmentType: "employee" | "contractor" | "apprentice";
      statutoryMode: "auto" | "manual" | "none";
    }
  >,
): Promise<PayRunItem[]> {
  const jurisdictionCodes = [...new Set([...staffMeta.values()].map((m) => m.jurisdictionCode))];
  const rulesByJurisdiction = new Map<string, Awaited<ReturnType<typeof loadPublishedRuleSets>>>();
  for (const code of jurisdictionCodes) {
    if (!code) continue;
    rulesByJurisdiction.set(code, await loadPublishedRuleSets(admin, code, payDate));
  }

  return items.map((item) => {
    const meta = staffMeta.get(item.staffId);
    if (!meta?.jurisdictionCode || meta.statutoryMode === "none") return item;

    const rules = rulesByJurisdiction.get(meta.jurisdictionCode) ?? [];
    const statutory = resolveJurisdictionStatutory(
      {
        jurisdictionCode: meta.jurisdictionCode,
        payDate,
        periodGross: item.grossPay,
        ytdTaxable: 0,
        employmentType: meta.employmentType,
        statutoryMode: meta.statutoryMode,
      },
      rules,
    );

    if (statutory.mode === "manual") {
      return item;
    }

    let tax = 0;
    let uif = 0;
    for (const line of statutory.lines) {
      if (line.code.startsWith("paye")) tax += line.amount;
      if (line.code.startsWith("uif")) uif += line.amount;
    }

    const net = computeNetPay({
      grossPay: item.grossPay,
      manualDeductions: item.manualDeductions,
      taxDeduction: tax,
      uifContribution: uif,
    });

    return {
      ...item,
      taxDeduction: tax,
      uifContribution: uif,
      netPay: net.netPay,
    };
  });
}
