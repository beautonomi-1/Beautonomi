import {
  composeE164FromNational,
  splitPhoneForNationalInput,
  validateE164Phone,
} from "@/lib/phone-country-codes";

jest.mock("@/lib/api-client", () => ({
  api: {
    patch: jest.fn(),
  },
}));

import { api } from "@/lib/api-client";

describe("emergency contact PATCH shape", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends emergency_contact with name, phone, country_code, relationship, email", async () => {
    (api.patch as jest.Mock).mockResolvedValue({ data: {} });

    const phoneE164 = "+27790624995";
    const split = splitPhoneForNationalInput(phoneE164, "+27");
    const payload = {
      emergency_contact: {
        name: "Jane Doe",
        relationship: "Partner",
        phone: phoneE164.trim(),
        country_code: split.countryCode,
        email: "jane@example.com",
      },
    };

    await api.patch("/api/me/profile", payload);

    expect(api.patch).toHaveBeenCalledWith("/api/me/profile", payload);
    expect(split.countryCode).toBe("+27");
    expect(composeE164FromNational(split.countryCode, split.nationalDisplay)).toBe(phoneE164);
  });

  it("allows null relationship and email when omitted", async () => {
    (api.patch as jest.Mock).mockResolvedValue({ data: {} });

    const phoneE164 = "+14155552671";
    const split = splitPhoneForNationalInput(phoneE164, "+1");
    const payload = {
      emergency_contact: {
        name: "Alex",
        relationship: null,
        phone: phoneE164.trim(),
        country_code: split.countryCode,
        email: null,
      },
    };

    await api.patch("/api/me/profile", payload);

    expect(api.patch).toHaveBeenCalledWith("/api/me/profile", payload);
  });

  it("validateE164Phone accepts well-formed numbers used by emergency contact", () => {
    expect(validateE164Phone("+27790624995")).toBeNull();
    expect(validateE164Phone("")).toBeNull();
    expect(validateE164Phone("+27")).not.toBeNull();
  });
});
