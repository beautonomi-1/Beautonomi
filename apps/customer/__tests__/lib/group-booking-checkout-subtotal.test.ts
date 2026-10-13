import { groupGuestsServiceSubtotal } from "@/lib/group-booking-checkout-subtotal";

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

  it("defaults a guest with no selection to the booker's services (matches consume payload)", () => {
    expect(
      groupGuestsServiceSubtotal([{ name: "Ama", service_ids: [] }], snapshotIds, prices),
    ).toBe(350);
  });

  it("ignores unnamed guests, which the consume payload drops", () => {
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

  it("is zero with no guests", () => {
    expect(groupGuestsServiceSubtotal([], snapshotIds, prices)).toBe(0);
  });
});
