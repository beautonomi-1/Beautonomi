import { describe, expect, it } from "vitest";
import { isAdjacentMove, nextStage, stageMoveReasonRequired } from "../stage-gates";

describe("stage gates", () => {
  it("allows adjacent forward move", () => {
    expect(isAdjacentMove("planning", "creative")).toBe(true);
    expect(nextStage("creative")).toBe("live");
  });

  it("requires reason for backward move", () => {
    expect(stageMoveReasonRequired("live", "creative")).toBe(true);
    expect(stageMoveReasonRequired("creative", "live")).toBe(false);
  });
});
