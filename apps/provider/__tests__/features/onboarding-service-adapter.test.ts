import {
  defaultOnboardingFormState,
  formStateToOnboardingService,
  onboardingServiceToFormState,
} from "@/features/catalogue/onboarding-service-adapter";
import { DEFAULT_SERVICE_FORM_STATE } from "@/features/catalogue/service-form-state";
import type { OnboardingService } from "@/features/provider-onboarding/types";

describe("onboarding-service-adapter", () => {
  it("round-trips core service fields", () => {
    const service: OnboardingService = {
      title: "Haircut",
      provider_category_name: "Hair",
      description: "Classic cut",
      duration_minutes: 45,
      price: 250,
      currency: "ZAR",
      supports_at_salon: true,
      supports_at_home: false,
      service_type: "basic",
      online_booking_enabled: true,
    };

    const form = onboardingServiceToFormState(service, "cat-1");
    expect(form.name).toBe("Haircut");
    expect(form.categoryId).toBe("cat-1");
    expect(form.description).toBe("Classic cut");

    const { service: out, error } = formStateToOnboardingService({
      form: { ...form, pricingOptions: [{ id: "p1", name: "Standard", price: 250, duration: 45, priceType: "fixed" }] },
      categoryName: "Hair",
      globalCategoryId: "global-1",
      currency: "ZAR",
      businessType: "salon",
    });

    expect(error).toBeNull();
    expect(out?.title).toBe("Haircut");
    expect(out?.provider_category_name).toBe("Hair");
    expect(out?.category_id).toBe("global-1");
    expect(out?.price).toBe(250);
  });

  it("returns validation error when category is missing", () => {
    const form = DEFAULT_SERVICE_FORM_STATE();
    form.name = "Trim";
    form.pricingOptions = [{ id: "p1", name: "Standard", price: 100, duration: 30, priceType: "fixed" }];
    form.supportsAtSalon = true;

    const { service, error } = formStateToOnboardingService({
      form,
      categoryName: "  ",
      currency: "ZAR",
      businessType: "salon",
    });

    expect(service).toBeNull();
    expect(error).toMatch(/category/i);
  });

  it("defaults salon vs mobile availability from business type", () => {
    const salon = defaultOnboardingFormState("salon");
    expect(salon.supportsAtSalon).toBe(true);
    expect(salon.supportsAtHome).toBe(false);

    const mobile = defaultOnboardingFormState("mobile");
    expect(mobile.supportsAtSalon).toBe(false);
    expect(mobile.supportsAtHome).toBe(true);
  });

  it("allows salon providers to enable at-home availability when toggled on", () => {
    const form = defaultOnboardingFormState("salon");
    form.name = "House call trim";
    form.supportsAtHome = true;
    form.pricingOptions = [
      { id: "p1", name: "Standard", price: 350, duration: 45, priceType: "fixed" },
    ];

    const { service, error } = formStateToOnboardingService({
      form,
      categoryName: "Hair",
      currency: "ZAR",
      businessType: "salon",
    });

    expect(error).toBeNull();
    expect(service?.supports_at_home).toBe(true);
    expect(service?.supports_at_salon).toBe(true);
  });

  it("preserves edited price when round-tripping through form state", () => {
    const service: OnboardingService = {
      title: "Trim",
      provider_category_name: "Hair",
      duration_minutes: 30,
      price: 180,
      currency: "ZAR",
      supports_at_salon: true,
      supports_at_home: false,
      service_type: "basic",
    };

    const form = onboardingServiceToFormState(service, "Hair");
    const edited = {
      ...form,
      pricingOptions: [{ id: "p1", name: "Standard", price: 220, duration: 30, priceType: "fixed" as const }],
    };

    const { service: updated, error } = formStateToOnboardingService({
      form: edited,
      categoryName: "Hair",
      currency: "ZAR",
      businessType: "salon",
    });

    expect(error).toBeNull();
    expect(updated?.price).toBe(220);
    expect(updated?.title).toBe("Trim");
  });
});
