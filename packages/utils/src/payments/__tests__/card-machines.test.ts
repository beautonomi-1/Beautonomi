import { describe, expect, it } from "vitest";
import { selectDefaultMachine, type CardMachine } from "../card-machines";

const base = (overrides: Partial<CardMachine>): CardMachine => ({
  id: "m1",
  provider: "paycloud",
  name: "Front desk",
  locationId: "loc-1",
  isActive: true,
  kind: "paycloud_terminal",
  capabilities: {
    apiRefund: true,
    tip: true,
    cashback: false,
    qr: true,
    sameDevice: false,
  },
  ...overrides,
});

describe("selectDefaultMachine", () => {
  it("prefers paired machine", () => {
    const machines = [
      base({ id: "a", locationId: "loc-1" }),
      base({ id: "b", locationId: null, name: "Portable" }),
    ];
    expect(
      selectDefaultMachine({
        machines,
        bookingLocationId: "loc-1",
        pairedMachineId: "b",
      }).machine?.id,
    ).toBe("b");
  });

  it("matches location then portable", () => {
    const machines = [
      base({ id: "a", locationId: "loc-2" }),
      base({ id: "b", locationId: null, name: "Portable" }),
    ];
    const r = selectDefaultMachine({ machines, bookingLocationId: "loc-1" });
    expect(r.machine?.id).toBe("b");
    expect(r.warning).toContain("portable");
  });
});
