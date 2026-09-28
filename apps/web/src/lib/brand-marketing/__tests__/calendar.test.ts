import { describe, expect, it } from "vitest";
import { quarterDateRange } from "../strategy";

describe("calendar quarter overlap", () => {
  it("Q2 window is inside calendar year", () => {
    const q = quarterDateRange(2026, 2);
    expect(q.start.getUTCFullYear()).toBe(2026);
    expect(q.end.getUTCMonth()).toBe(5);
  });
});
