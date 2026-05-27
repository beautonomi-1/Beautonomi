import { validateServiceForm } from "@/features/catalogue/validateServiceForm";
import { DEFAULT_PRICING_OPTION } from "@/features/catalogue/types";

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
});
