import { describe, expect, it } from "vitest";
import { firstHoldSnapshotOfferingId } from "../first-hold-snapshot-offering-id";

describe("firstHoldSnapshotOfferingId", () => {
  it("returns the first line offering_id", () => {
    expect(
      firstHoldSnapshotOfferingId([
        { offering_id: "off-1" },
        { offering_id: "off-2" },
      ]),
    ).toBe("off-1");
  });

  it("returns empty string for missing or invalid snapshots", () => {
    expect(firstHoldSnapshotOfferingId([])).toBe("");
    expect(firstHoldSnapshotOfferingId(null)).toBe("");
    expect(firstHoldSnapshotOfferingId({})).toBe("");
    expect(firstHoldSnapshotOfferingId([{ staff_id: "s1" }])).toBe("");
    expect(firstHoldSnapshotOfferingId([{ offering_id: "  " }])).toBe("");
  });
});
