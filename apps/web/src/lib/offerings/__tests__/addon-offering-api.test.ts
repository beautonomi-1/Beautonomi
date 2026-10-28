import { describe, expect, it } from "vitest";
import {
  addonAppliesTo,
  applicableAddonIds,
} from "@/lib/offerings/addon-applicability";
import {
  filterAddonsByService,
  mapOfferingRowToAddonApi,
  shouldReturnEmptyForAddonTypeFilter,
  OFFERING_ADDON_SELECT,
} from "@/lib/offerings/addon-offering-api";

describe("addon-offering-api", () => {
  it("maps offering row to legacy API field names", () => {
    const mapped = mapOfferingRowToAddonApi({
      id: "a1",
      provider_id: "p1",
      title: "Deep conditioning",
      price: 50,
      display_order: 3,
      addon_category: "hair_treatments",
      applicable_service_ids: ["s1"],
    });
    expect(mapped.name).toBe("Deep conditioning");
    expect(mapped.sort_order).toBe(3);
    expect(mapped.service_ids).toEqual(["s1"]);
    expect(mapped.type).toBe("service");
  });

  it("OFFERING_ADDON_SELECT does not reference sort_order or name columns", () => {
    expect(OFFERING_ADDON_SELECT).toContain("title");
    expect(OFFERING_ADDON_SELECT).toContain("display_order");
    expect(OFFERING_ADDON_SELECT).not.toMatch(/\bname\b/);
    expect(OFFERING_ADDON_SELECT).not.toMatch(/\bsort_order\b/);
  });

  it("filters addons by applicable_service_ids", () => {
    const addons = [
      { id: "1", applicable_service_ids: null },
      { id: "2", applicable_service_ids: ["other"] },
      { id: "3", applicable_service_ids: ["target"] },
    ];
    const filtered = filterAddonsByService(addons, { id: "target" });
    expect(filtered.map((a) => a.id)).toEqual(["1", "3"]);
  });

  it("addonAppliesTo respects parent_service_id", () => {
    const target = { id: "child", parent_service_id: "parent" };
    expect(applicableAddonIds(target)).toContain("parent");
    expect(
      addonAppliesTo({ applicable_service_ids: ["parent"] }, target),
    ).toBe(true);
  });

  it("returns empty for product/upgrade type filters", () => {
    expect(shouldReturnEmptyForAddonTypeFilter("product")).toBe(true);
    expect(shouldReturnEmptyForAddonTypeFilter("service")).toBe(false);
    expect(shouldReturnEmptyForAddonTypeFilter(null)).toBe(false);
  });
});
