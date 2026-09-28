import { describe, expect, it } from "vitest";
import { getKpiByKey, getKpiCatalog } from "../kpis";

describe("kpi catalog", () => {
  it("includes signups", () => {
    expect(getKpiByKey("signups")?.source).toBe("measured");
  });
  it("derives cost_per_signup with divide by zero guard", () => {
    const kpi = getKpiByKey("cost_per_signup");
    expect(kpi?.derive?.({ signups: 0, known_spend: 100 })).toBeNull();
    expect(kpi?.derive?.({ signups: 2, known_spend: 100 })).toBe(50);
  });
  it("every key is unique", () => {
    const keys = getKpiCatalog().map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
