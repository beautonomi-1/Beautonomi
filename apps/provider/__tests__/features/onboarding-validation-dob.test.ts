import { validateStep } from "@/features/provider-onboarding/validation";

describe("validateStep identity (step 2)", () => {
  const base = {
    owner_name: "Ada Lovelace",
    owner_email: "ada@example.com",
    email_verified: true,
    owner_phone: "+27821234567",
    phone_verified: true,
    date_of_birth: "1990-06-15",
  };

  it("requires date of birth", () => {
    const result = validateStep(2, { ...base, date_of_birth: undefined });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /date of birth/i.test(e))).toBe(true);
  });

  it("rejects under-13 date of birth", () => {
    const result = validateStep(2, { ...base, date_of_birth: "2020-01-01" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /13 years old/i.test(e))).toBe(true);
  });

  it("skips name/email requirements for Apple identity", () => {
    const result = validateStep(
      2,
      {
        owner_phone: "+27821234567",
        phone_verified: true,
        date_of_birth: "1990-06-15",
      },
      { appleIdentity: true },
    );
    expect(result.valid).toBe(true);
  });

  it("still requires date of birth for Apple identity", () => {
    const result = validateStep(
      2,
      {
        owner_phone: "+27821234567",
        phone_verified: true,
      },
      { appleIdentity: true },
    );
    expect(result.valid).toBe(false);
  });
});
