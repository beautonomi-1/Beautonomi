import { validateServiceForm } from "@/features/catalogue/validateServiceForm";
import {
  DEFAULT_PRICING_OPTION,
  buildCustomerBookingTierPreview,
  resolveBookingTierDisplayPrice,
} from "@/features/catalogue/types";
import {
  activeBookingTierNamesFromForm,
  listChildVariantsToTurnOff,
} from "@/features/catalogue/bookingTierSyncPreview";
import type { CatalogueServiceItem } from "@/features/catalogue/types";

describe("validateServiceForm", () => {
  it("requires parent_service_id for variant type", () => {
    const err = validateServiceForm({
      name: "Variant",
      categoryId: "cat-1",
      serviceType: "variant",
      parentServiceId: "",
      pricingOptions: [DEFAULT_PRICING_OPTION()],
    });
    expect(err).toMatch(/Parent service is required/);
  });

  it("accepts valid basic service with primary pricing row at index 0", () => {
    const err = validateServiceForm({
      name: "Cut",
      categoryId: "cat-1",
      serviceType: "basic",
      parentServiceId: "",
      pricingOptions: [{ ...DEFAULT_PRICING_OPTION(), duration: 60, price: 0 }],
    });
    expect(err).toBeNull();
  });

  it("rejects virtual category ids", () => {
    const err = validateServiceForm({
      name: "Cut",
      categoryId: "other",
      serviceType: "basic",
      parentServiceId: "",
      pricingOptions: [DEFAULT_PRICING_OPTION()],
    });
    expect(err).toMatch(/category is required/i);
  });

  it("validates additional tier duration and price", () => {
    const err = validateServiceForm({
      name: "Cut",
      categoryId: "cat-1",
      serviceType: "basic",
      parentServiceId: "",
      pricingOptions: [
        { ...DEFAULT_PRICING_OPTION(), duration: 60, price: 100 },
        { ...DEFAULT_PRICING_OPTION(), id: "2", duration: 0, price: 150 },
      ],
    });
    expect(err).toMatch(/Tier 2: duration/);
  });

  it("rejects duplicate explicit tier names", () => {
    const err = validateServiceForm({
      name: "Cut",
      categoryId: "cat-1",
      serviceType: "basic",
      parentServiceId: "",
      pricingOptions: [
        { ...DEFAULT_PRICING_OPTION(), duration: 60, price: 100, pricingName: "Express" },
        { ...DEFAULT_PRICING_OPTION(), id: "2", duration: 90, price: 150, pricingName: "Express" },
      ],
    });
    expect(err).toMatch(/unique/i);
  });

  it("accepts multi-tier service with valid rows", () => {
    const err = validateServiceForm({
      name: "Cut",
      categoryId: "cat-1",
      serviceType: "basic",
      parentServiceId: "",
      pricingOptions: [
        { ...DEFAULT_PRICING_OPTION(), duration: 60, price: 100 },
        { ...DEFAULT_PRICING_OPTION(), id: "2", duration: 90, price: 150 },
      ],
    });
    expect(err).toBeNull();
  });

  it("buildCustomerBookingTierPreview is empty for single tier", () => {
    expect(buildCustomerBookingTierPreview([DEFAULT_PRICING_OPTION()])).toEqual([]);
  });

  it("buildCustomerBookingTierPreview lists all multi-tier options", () => {
    const preview = buildCustomerBookingTierPreview([
      { ...DEFAULT_PRICING_OPTION(), duration: 60, price: 100 },
      { ...DEFAULT_PRICING_OPTION(), id: "2", duration: 90, price: 150, pricingName: "Long" },
    ]);
    expect(preview).toHaveLength(2);
    expect(preview[0].name).toBe("Standard");
    expect(preview[1].name).toBe("Long");
  });
});

describe("resolveBookingTierDisplayPrice", () => {
  const tiers = [
    { ...DEFAULT_PRICING_OPTION(), duration: 60, price: 100 },
    { ...DEFAULT_PRICING_OPTION(), id: "2", duration: 90, price: 0 },
    { ...DEFAULT_PRICING_OPTION(), id: "3", duration: 120, price: 150, pricingName: "Long" },
  ];

  it("shows first tier price including 0", () => {
    expect(resolveBookingTierDisplayPrice([{ ...DEFAULT_PRICING_OPTION(), price: 0 }], 0)).toBe(0);
  });

  it("falls back to first tier for later blank price", () => {
    expect(resolveBookingTierDisplayPrice(tiers, 1)).toBe(100);
  });

  it("keeps explicit later tier price", () => {
    expect(resolveBookingTierDisplayPrice(tiers, 2)).toBe(150);
  });

  it("preview uses display price for blank later tier", () => {
    const preview = buildCustomerBookingTierPreview(tiers);
    expect(preview[1].price).toBe(100);
  });
});

describe("listChildVariantsToTurnOff", () => {
  const parentId = "parent-1";

  function child(overrides: Partial<CatalogueServiceItem>): CatalogueServiceItem {
    return {
      id: "c1",
      title: "Child",
      name: "Child",
      service_type: "variant",
      parent_service_id: parentId,
      is_active: true,
      ...overrides,
    } as CatalogueServiceItem;
  }

  it("returns every active child when only one booking option remains", () => {
    const all = [
      child({ id: "a", variant_name: "Short", title: "Cut - Short" }),
      child({ id: "b", variant_name: "Long", title: "Cut - Long" }),
    ];
    expect(listChildVariantsToTurnOff(parentId, [DEFAULT_PRICING_OPTION()], null, all)).toEqual([
      "Short",
      "Long",
    ]);
  });

  it("returns only children whose names are not in the deduped tier list", () => {
    const options = [
      { ...DEFAULT_PRICING_OPTION(), duration: 60, price: 100 },
      { ...DEFAULT_PRICING_OPTION(), id: "2", duration: 90, price: 150, pricingName: "Long" },
    ];
    const all = [
      child({ id: "a", variant_name: "Standard" }),
      child({ id: "b", variant_name: "Long" }),
      child({ id: "c", variant_name: "Removed" }),
    ];
    expect(listChildVariantsToTurnOff(parentId, options, null, all)).toEqual(["Removed"]);
  });

  it("matches on variant_name, not offering title", () => {
    const options = [
      { ...DEFAULT_PRICING_OPTION(), duration: 60, price: 100 },
      { ...DEFAULT_PRICING_OPTION(), id: "2", duration: 90, price: 150, pricingName: "Long" },
    ];
    const all = [
      child({
        id: "a",
        variant_name: "Long",
        title: "Haircut - Legacy title",
        name: "Haircut - Legacy title",
      }),
    ];
    expect(listChildVariantsToTurnOff(parentId, options, null, all)).toEqual([]);
  });

  it("omits inactive children", () => {
    const all = [child({ id: "a", variant_name: "Short", is_active: false })];
    expect(listChildVariantsToTurnOff(parentId, [DEFAULT_PRICING_OPTION()], null, all)).toEqual([]);
  });

  it("dedupes blank first name and explicit Standard into Standard and Standard (2)", () => {
    const options = [
      { ...DEFAULT_PRICING_OPTION(), duration: 60, price: 100, pricingName: "" },
      { ...DEFAULT_PRICING_OPTION(), id: "2", duration: 90, price: 150, pricingName: "Standard" },
    ];
    expect(activeBookingTierNamesFromForm(options, null)).toEqual(["Standard", "Standard (2)"]);
    const all = [
      child({ id: "a", variant_name: "Standard" }),
      child({ id: "b", variant_name: "Standard (2)" }),
      child({ id: "c", variant_name: "Old tier" }),
    ];
    expect(listChildVariantsToTurnOff(parentId, options, null, all)).toEqual(["Old tier"]);
  });
});
