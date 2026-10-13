import { describe, expect, it } from "vitest";
import {
  groupGuestsServiceSubtotal,
  sumGroupParticipantServicesTotal,
} from "../group-guests-service-subtotal";

describe("groupGuestsServiceSubtotal", () => {
  const prices = new Map([
    ["cut", 100],
    ["colour", 250],
  ]);
  const snapshotIds = ["cut", "colour"];

  it("prices each named guest's selected services", () => {
    expect(
      groupGuestsServiceSubtotal(
        [
          { name: "Ama", service_ids: ["cut"] },
          { name: "Lebo", service_ids: ["colour"] },
        ],
        snapshotIds,
        prices,
      ),
    ).toBe(350);
  });

  it("defaults empty selection to booker services", () => {
    expect(groupGuestsServiceSubtotal([{ name: "Ama", service_ids: [] }], snapshotIds, prices)).toBe(
      350,
    );
  });

  it("ignores unnamed guests", () => {
    expect(
      groupGuestsServiceSubtotal(
        [
          { name: "Ama", service_ids: ["cut"] },
          { name: "   ", service_ids: ["colour"] },
        ],
        snapshotIds,
        prices,
      ),
    ).toBe(100);
  });
});

describe("sumGroupParticipantServicesTotal", () => {
  const booker = ["cut", "colour"];
  const price = (id: string) => (id === "cut" ? 100 : id === "colour" ? 250 : 0);

  it("matches consume rules for web participant shape", () => {
    expect(
      sumGroupParticipantServicesTotal(
        [
          { name: "You", serviceIds: ["cut", "colour"] },
          { name: "Guest", serviceIds: [] },
        ],
        booker,
        price,
      ),
    ).toBe(700);
  });
});
