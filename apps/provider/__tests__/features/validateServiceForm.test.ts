import { validateServiceForm } from "@/features/catalogue/validateServiceForm";
import { DEFAULT_PRICING_OPTION, buildCustomerBookingTierPreview } from "@/features/catalogue/types";

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
