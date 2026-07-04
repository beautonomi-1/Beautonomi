import { computeScrollTargetY } from "@/hooks/useScrollToFocusedInput";

describe("computeScrollTargetY", () => {
  it("subtracts offset from content Y and floors at zero", () => {
    expect(computeScrollTargetY(180, 96)).toBe(84);
    expect(computeScrollTargetY(40, 96)).toBe(0);
  });

  it("uses the default offset when none is provided", () => {
    expect(computeScrollTargetY(120)).toBe(24);
  });

  it("supports larger multiline offsets", () => {
    expect(computeScrollTargetY(260, 200)).toBe(60);
  });
});
