import { describe, expect, it } from "vitest";
import { preservedWalkInPaidAt } from "../fulfill-walk-in-product-order-delivery";

describe("preservedWalkInPaidAt", () => {
  it("keeps the original payment time when the sale is delivered later", () => {
    expect(preservedWalkInPaidAt("2026-11-01T08:00:00.000Z", "2026-11-13T15:00:00.000Z")).toBe(
      "2026-11-01T08:00:00.000Z",
    );
  });

  it("uses the delivery time when the sale has no payment time yet", () => {
    expect(preservedWalkInPaidAt(null, "2026-11-13T15:00:00.000Z")).toBe("2026-11-13T15:00:00.000Z");
    expect(preservedWalkInPaidAt("  ", "2026-11-13T15:00:00.000Z")).toBe("2026-11-13T15:00:00.000Z");
  });
});
