import { describe, expect, it } from "vitest";
import { canEnableCatalogModel } from "@/lib/ai/eval-gate";

describe("canEnableCatalogModel", () => {
  it("allows enabling in staging without eval", () => {
    expect(canEnableCatalogModel({ environment: "staging", enabled: true, evalPassedAt: null }).allowed).toBe(true);
  });
  it("blocks production enable without eval_passed_at", () => {
    const r = canEnableCatalogModel({ environment: "production", enabled: true, evalPassedAt: null });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("eval_required_before_production_enable");
  });
  it("allows production enable when eval passed", () => {
    expect(
      canEnableCatalogModel({ environment: "production", enabled: true, evalPassedAt: "2026-01-01" }).allowed,
    ).toBe(true);
  });
});
