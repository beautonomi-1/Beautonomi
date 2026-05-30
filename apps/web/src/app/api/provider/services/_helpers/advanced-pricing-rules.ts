export interface AdvancedPricingRuleInput {
  id?: string;
  type?: string;
  name?: string;
  enabled?: boolean;
  conditions?: Record<string, unknown>;
  priceAdjustment?: {
    type?: string;
    value?: number;
  };
}

/** Normalize client payload before persisting to offerings.advanced_pricing_rules JSONB. */
export function normalizeAdvancedPricingRules(input: unknown): AdvancedPricingRuleInput[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const rule = row as AdvancedPricingRuleInput;
      const adjustment = rule.priceAdjustment ?? {};
      const value = Number(adjustment.value);
      return {
        id: typeof rule.id === "string" && rule.id.trim() ? rule.id.trim() : `rule-${Date.now()}`,
        type: typeof rule.type === "string" ? rule.type : "time_based",
        name: typeof rule.name === "string" ? rule.name.trim() : "",
        enabled: rule.enabled !== false,
        conditions:
          rule.conditions && typeof rule.conditions === "object" && !Array.isArray(rule.conditions)
            ? rule.conditions
            : {},
        priceAdjustment: {
          type: adjustment.type === "fixed" ? "fixed" : "percentage",
          value: Number.isFinite(value) ? value : 0,
        },
      };
    });
}

export function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const msg = String((error as { message?: string }).message ?? "").toLowerCase();
  const code = String((error as { code?: string }).code ?? "");
  const col = column.toLowerCase();
  return (
    code === "PGRST204" ||
    (msg.includes(col) && (msg.includes("column") || msg.includes("schema cache")))
  );
}
