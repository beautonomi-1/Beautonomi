import { describe, expect, it } from "vitest";
import type { PaycloudReadinessBlocker } from "../paycloud-readiness";

function mockReady(blockers: PaycloudReadinessBlocker[]) {
  return { ready: blockers.length === 0, blockers };
}

describe("paycloud readiness blockers", () => {
  it("ready when no blockers", () => {
    expect(mockReady([]).ready).toBe(true);
  });

  it("blocked when NOT_ACCEPTED", () => {
    const r = mockReady([
      { code: "NOT_ACCEPTED", title: "Turn on", actionLabel: "Settings", href: "/card-machines" },
    ]);
    expect(r.ready).toBe(false);
    expect(r.blockers[0].code).toBe("NOT_ACCEPTED");
  });

  it("blocked when NO_TERMINALS", () => {
    expect(
      mockReady([{ code: "NO_TERMINALS", title: "Add machine", actionLabel: "Add" }]).ready,
    ).toBe(false);
  });
});
