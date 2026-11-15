import { buildSubmitPayload } from "@/features/provider-onboarding/validation";

describe("buildSubmitPayload", () => {
  it("turns social handles and a bare website into URLs the onboarding API accepts", () => {
    const payload = buildSubmitPayload({
      business_type: "salon",
      business_name: "Studio",
      social_media_links: { instagram: "@studio", facebook: "" },
      website: "studio.example",
      is_vat_registered: false,
      vat_number: "4123456789",
    });
    expect(payload.social_media_links).toEqual({
      facebook: undefined,
      instagram: "https://instagram.com/studio",
      twitter: undefined,
      linkedin: undefined,
    });
    expect(payload.website).toBe("https://studio.example");
    expect(payload.vat_number).toBeNull();
    expect(payload.travel_fees).toBeUndefined();
  });

  it("keeps travel fees for a mobile business", () => {
    const payload = buildSubmitPayload({
      business_type: "mobile",
      business_name: "Visits",
    });
    expect(payload.travel_fees).toEqual({ enabled: true, use_platform_default: true });
  });
});
