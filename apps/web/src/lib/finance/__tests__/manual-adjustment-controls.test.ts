import { describe, expect, it } from "vitest";
import {
  DEFAULT_MANUAL_ADJUSTMENT_CONTROLS,
  evaluateManualAdjustment,
  readManualAdjustmentControls,
} from "../manual-adjustment-controls";

describe("F2-48 manual adjustment controls", () => {
  it("defaults: direct superadmin post allowed up to 5,000; hard cap 1,000,000", () => {
    expect(DEFAULT_MANUAL_ADJUSTMENT_CONTROLS).toEqual({
      direct_post_max_major: 5_000,
      hard_cap_major: 1_000_000,
    });
    expect(readManualAdjustmentControls(null)).toEqual(DEFAULT_MANUAL_ADJUSTMENT_CONTROLS);
  });

  it("reads finance.manual_adjustments from platform_settings and ignores garbage", () => {
    expect(
      readManualAdjustmentControls({
        finance: { manual_adjustments: { direct_post_max_major: 100, hard_cap_major: 50_000 } },
      }),
    ).toEqual({ direct_post_max_major: 100, hard_cap_major: 50_000 });
    expect(
      readManualAdjustmentControls({
        finance: { manual_adjustments: { direct_post_max_major: -1, hard_cap_major: "x" } },
      }),
    ).toEqual(DEFAULT_MANUAL_ADJUSTMENT_CONTROLS);
  });

  it("rejects amounts above the hard cap for everyone", () => {
    const res = evaluateManualAdjustment({
      amount: 1_000_000.01,
      role: "superadmin",
      controls: DEFAULT_MANUAL_ADJUSTMENT_CONTROLS,
    });
    expect(res).toEqual(expect.objectContaining({ decision: "reject", code: "ADJUSTMENT_OVER_CAP" }));
  });

  it("uses the absolute value so negative adjustments are capped too", () => {
    const res = evaluateManualAdjustment({
      amount: -1_000_000.01,
      role: "superadmin",
      controls: DEFAULT_MANUAL_ADJUSTMENT_CONTROLS,
    });
    expect(res.decision).toBe("reject");
  });

  it("lets a superadmin post directly under the direct-post limit", () => {
    const res = evaluateManualAdjustment({
      amount: 5_000,
      role: "superadmin",
      controls: DEFAULT_MANUAL_ADJUSTMENT_CONTROLS,
    });
    expect(res.decision).toBe("post");
  });

  it("forces a superadmin over the direct-post limit into maker-checker", () => {
    const res = evaluateManualAdjustment({
      amount: 5_000.01,
      role: "superadmin",
      controls: DEFAULT_MANUAL_ADJUSTMENT_CONTROLS,
    });
    expect(res).toEqual(expect.objectContaining({ decision: "propose", reason: "over_direct_post_limit" }));
  });

  it("non-superadmins always propose", () => {
    const res = evaluateManualAdjustment({
      amount: 1,
      role: "admin_finance",
      controls: DEFAULT_MANUAL_ADJUSTMENT_CONTROLS,
    });
    expect(res).toEqual(expect.objectContaining({ decision: "propose", reason: "maker_checker" }));
  });

  it("rejects non-finite amounts", () => {
    expect(
      evaluateManualAdjustment({ amount: Number.NaN, role: "superadmin", controls: DEFAULT_MANUAL_ADJUSTMENT_CONTROLS })
        .decision,
    ).toBe("reject");
  });
});
