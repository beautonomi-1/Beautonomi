import { buildServicePayload } from "@/features/catalogue/buildServicePayload";
import { validateServiceForm } from "@/features/catalogue/validateServiceForm";
import { DEFAULT_PRICING_OPTION } from "@/features/catalogue/types";

describe("package included services", () => {
  it("validateServiceForm requires included services for package type", () => {
    const err = validateServiceForm({
      name: "Spa Package",
      categoryId: "cat-1",
      serviceType: "package",
      parentServiceId: "",
      pricingOptions: [{ ...DEFAULT_PRICING_OPTION(), duration: 60, price: 100 }],
      includedServices: [],
    });
    expect(err).toMatch(/include/i);
  });

  it("validateServiceForm accepts package with included services", () => {
    const err = validateServiceForm({
      name: "Spa Package",
      categoryId: "cat-1",
      serviceType: "package",
      parentServiceId: "",
      pricingOptions: [{ ...DEFAULT_PRICING_OPTION(), duration: 60, price: 100 }],
      includedServices: ["svc-1", "svc-2"],
    });
    expect(err).toBeNull();
  });

  it("buildServicePayload includes included_services array", () => {
    const payload = buildServicePayload({
      name: "Spa Package",
      categoryId: "cat-1",
      serviceType: "package",
      description: "",
      aftercareDescription: "",
      availableFor: "everyone",
      onlineBookable: true,
      teamMemberIds: [],
      teamMemberCommissionEnabled: false,
      pricingOptions: [{ ...DEFAULT_PRICING_OPTION(), duration: 60, price: 100 }],
      advancedPricingRules: [],
      extraTimeEnabled: false,
      extraTimeDuration: 0,
      reminderToRebookEnabled: false,
      reminderToRebookWeeks: 4,
      serviceCostPercentage: 0,
      taxRate: 0,
      includedServices: ["svc-a", "svc-b"],
      isActive: true,
      supportsAtSalon: true,
      supportsAtHome: false,
      atHomeRadiusKm: null,
      atHomePriceAdjustment: 0,
      addonCategory: "general",
      applicableServiceIds: [],
      isRecommended: false,
      parentServiceId: "",
      variantName: "",
      variantSortOrder: 0,
    });
    expect(payload.included_services).toEqual(["svc-a", "svc-b"]);
    expect(payload.service_type).toBe("package");
  });

  it("toggle logic adds and removes service ids", () => {
    let selectedIds: string[] = [];
    const toggle = (id: string) => {
      if (selectedIds.includes(id)) {
        selectedIds = selectedIds.filter((x) => x !== id);
      } else {
        selectedIds = [...selectedIds, id];
      }
    };
    toggle("svc-1");
    toggle("svc-2");
    expect(selectedIds).toEqual(["svc-1", "svc-2"]);
    toggle("svc-1");
    expect(selectedIds).toEqual(["svc-2"]);
  });
});
