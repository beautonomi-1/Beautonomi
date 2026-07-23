import { validateStep } from "@/features/provider-onboarding/validation";

describe("validateStep — service zones", () => {
  it("requires at least one zone for mobile providers", () => {
    const result = validateStep(9, {
      business_type: "mobile",
      selected_zone_ids: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Please select at least one service zone");
  });

  it("passes when a zone is selected", () => {
    const result = validateStep(9, {
      business_type: "both",
      selected_zone_ids: ["zone-1"],
    });
    expect(result.valid).toBe(true);
  });

  it("does not require zones for salon-only providers", () => {
    const result = validateStep(9, {
      business_type: "salon",
      selected_zone_ids: [],
    });
    expect(result.valid).toBe(true);
  });
});
