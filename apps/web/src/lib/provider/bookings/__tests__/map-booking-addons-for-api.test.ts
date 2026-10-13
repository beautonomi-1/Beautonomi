import { describe, expect, it } from "vitest";
import { mapBookingAddonsForApi } from "../map-booking-addons-for-api";

describe("mapBookingAddonsForApi", () => {
  it("maps join rows with offering title fallback", () => {
    const out = mapBookingAddonsForApi([
      {
        id: "ba1",
        addon_id: "off1",
        addon_name: null,
        quantity: 2,
        price: 50,
        offerings: { title: "Deep conditioning", duration_minutes: 15, applicable_service_ids: ["s1"] },
      },
    ]);
    expect(out).toEqual([
      {
        id: "ba1",
        addon_id: "off1",
        addon_name: "Deep conditioning",
        quantity: 2,
        price: 50,
        duration_minutes: 15,
        applicable_service_ids: ["s1"],
      },
    ]);
  });

  it("prefers persisted addon_name over offering title", () => {
    const out = mapBookingAddonsForApi([
      {
        id: "ba2",
        addon_id: "off2",
        addon_name: "Saved label",
        offerings: { title: "Catalog title" },
      },
    ]);
    expect(out[0]?.addon_name).toBe("Saved label");
  });
});
