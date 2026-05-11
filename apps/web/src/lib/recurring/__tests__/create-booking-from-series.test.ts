import { describe, expect, it } from "vitest";
import { resolveAddonLines } from "../create-booking-from-series";

describe("resolveAddonLines", () => {
  it("uses explicit recurring metadata add-ons", () => {
    expect(
      resolveAddonLines({
        metadata: {
          addons: [
            { addon_id: "addon-1", quantity: 1, price: 75, currency: "ZAR" },
          ],
        },
      }),
    ).toEqual([{ addon_id: "addon-1", quantity: 1, price: 75, currency: "ZAR" }]);
  });

  it("falls back to add-on cart items for generated occurrences", () => {
    expect(
      resolveAddonLines({
        metadata: {
          cart_items: [
            { type: "service", service_id: "svc-1", total: 250 },
            { type: "addon", addon_id: "addon-2", quantity: 2, unit_price: 40, total: 80 },
          ],
        },
      }),
    ).toEqual([{ addon_id: "addon-2", quantity: 2, price: 40, currency: null }]);
  });
});
