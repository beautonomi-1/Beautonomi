import { buildSubmitPayload } from "@/features/provider-onboarding/validation";

describe("buildSubmitPayload", () => {
  it("omits empty owner email and name instead of sending empty strings", () => {
    const payload = buildSubmitPayload({
      owner_name: "  ",
      owner_email: "",
      owner_phone: "+27123456789",
      business_name: "Test",
      business_type: "salon",
      global_category_ids: ["11111111-1111-4111-8111-111111111111"],
    });
    expect(payload.owner_name).toBeUndefined();
    expect(payload.owner_email).toBeUndefined();
    expect(payload.email).toBeUndefined();
  });

  it("omits empty owner_phone instead of sending empty string", () => {
    const payload = buildSubmitPayload({
      owner_phone: "",
      business_name: "Test",
      business_type: "salon",
      global_category_ids: [],
    });
    expect(payload.owner_phone).toBeUndefined();
    expect(payload.phone).toBeUndefined();
  });

  it("normalizes date_of_birth empty to null", () => {
    const payload = buildSubmitPayload({
      date_of_birth: "   ",
      business_name: "Test",
      business_type: "salon",
      global_category_ids: [],
    });
    expect(payload.date_of_birth).toBeNull();
  });
});
