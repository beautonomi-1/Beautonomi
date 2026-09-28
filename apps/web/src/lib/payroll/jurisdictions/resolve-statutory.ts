import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePackForJurisdiction } from "./registry";
import type { PayrollRuleSetRow, StatutoryContext, StatutoryResult } from "./types";

export async function loadPublishedRuleSets(
  admin: SupabaseClient,
  jurisdictionCode: string,
  payDate: string,
): Promise<PayrollRuleSetRow[]> {
  const { data, error } = await admin
    .from("payroll_rule_sets")
    .select("id, jurisdiction_code, rule_type, effective_from, effective_to, status, data")
    .eq("jurisdiction_code", jurisdictionCode)
    .eq("status", "published")
    .lte("effective_from", payDate)
    .or(`effective_to.is.null,effective_to.gte.${payDate}`);
  if (error) {
    console.warn("[payroll] loadPublishedRuleSets:", error.message);
    return [];
  }
  return (data ?? []) as PayrollRuleSetRow[];
}

export function resolveJurisdictionStatutory(
  ctx: StatutoryContext,
  ruleSets: PayrollRuleSetRow[],
): StatutoryResult {
  if (!ctx.jurisdictionCode) {
    return { mode: "manual", reason: "no_jurisdiction", lines: [] };
  }
  if (ruleSets.length === 0) {
    return {
      mode: "manual",
      reason: "no_published_rules",
      lines: [],
    };
  }

  const byType = new Map<string, PayrollRuleSetRow>();
  for (const r of ruleSets) {
    byType.set(r.rule_type, r);
  }

  const pack = resolvePackForJurisdiction(ctx.jurisdictionCode);
  if (!pack) {
    return { mode: "manual", reason: "unsupported_jurisdiction", lines: [] };
  }

  return pack.calculate(ctx, {
    incomeTax: byType.get("income_tax")?.data,
    social: byType.get("social_contributions")?.data,
    sdl: byType.get("employer_levies")?.data,
    minimumWage: byType.get("minimum_wage")?.data,
    overtime: byType.get("overtime")?.data,
  });
}
