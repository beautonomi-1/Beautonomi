import type { StatutoryContext, StatutoryResult } from "./types";
import { calculateZaStatutory } from "./packs/za";

export type JurisdictionPackModule = {
  code: string;
  /** ISO 3166-1 alpha-2 or subdivision code this pack handles. */
  supports: (jurisdictionCode: string) => boolean;
  calculate: (
    ctx: StatutoryContext,
    ruleData: Record<string, unknown>,
  ) => StatutoryResult;
};

const ZA_PACK: JurisdictionPackModule = {
  code: "ZA",
  supports: (code) => code === "ZA" || code.startsWith("ZA-"),
  calculate: (ctx, ruleData) =>
    calculateZaStatutory(ctx, ruleData as Parameters<typeof calculateZaStatutory>[1]),
};

/** Registered jurisdiction packs (formula modules — rates live in payroll_rule_sets). */
export const JURISDICTION_PACKS: JurisdictionPackModule[] = [ZA_PACK];

export function resolvePackForJurisdiction(
  jurisdictionCode: string,
): JurisdictionPackModule | null {
  const normalized = jurisdictionCode.trim().toUpperCase();
  return JURISDICTION_PACKS.find((p) => p.supports(normalized)) ?? null;
}
