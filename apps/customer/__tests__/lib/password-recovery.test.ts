import {
  getNewPasswordIssue,
  getPasswordStrength,
  passwordMeetsPolicyRequirements,
} from "@/lib/auth/password-recovery";

describe("password recovery helpers", () => {
  it("matches the web password policy modes", () => {
    expect(passwordMeetsPolicyRequirements("password", "none")).toBe(true);
    expect(passwordMeetsPolicyRequirements("password", "letters_and_digits")).toBe(false);
    expect(passwordMeetsPolicyRequirements("passw0rd", "letters_and_digits")).toBe(true);
    expect(passwordMeetsPolicyRequirements("passw0rd", "lowercase_uppercase_number")).toBe(false);
    expect(passwordMeetsPolicyRequirements("Passw0rd", "lowercase_uppercase_number")).toBe(true);
  });

  it("checks length, then policy, then confirmation", () => {
    const policy = { minimum_password_length: 8, password_requirements: "none" as const };
    expect(getNewPasswordIssue("short", "short", policy)).toBe("minLength");
    expect(
      getNewPasswordIssue("password", "password", { ...policy, password_requirements: "letters_and_digits" }),
    ).toBe("policy");
    expect(getNewPasswordIssue("password1", "password2", policy)).toBe("mismatch");
    expect(getNewPasswordIssue("password1", "password1", policy)).toBeNull();
  });

  it("scores strength like signup", () => {
    expect(getPasswordStrength("abcdefgh").labelKey).toBe("passwordWeak");
    expect(getPasswordStrength("abcdefg1").labelKey).toBe("passwordFair");
    expect(getPasswordStrength("Abcdefg1").labelKey).toBe("passwordGood");
    expect(getPasswordStrength("Abcdefghijk1!").labelKey).toBe("passwordStrong");
  });
});
