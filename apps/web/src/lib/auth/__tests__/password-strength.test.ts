import { describe, it, expect } from "vitest";
import { getNewPasswordIssue, getPasswordStrength } from "../password-strength";

describe("getPasswordStrength", () => {
  it("scores like the signup forms", () => {
    expect(getPasswordStrength("").labelKey).toBe("passwordWeak");
    expect(getPasswordStrength("abcdefgh").score).toBe(1);
    expect(getPasswordStrength("abcdefg1").labelKey).toBe("passwordFair");
    expect(getPasswordStrength("Abcdefg1").labelKey).toBe("passwordGood");
    expect(getPasswordStrength("Abcdefghijk1!").score).toBe(5);
    expect(getPasswordStrength("Abcdefghijk1!").labelKey).toBe("passwordStrong");
  });
});

describe("getNewPasswordIssue", () => {
  const policy = { minimum_password_length: 8, password_requirements: "none" as const };

  it("checks length, then policy, then confirmation", () => {
    expect(getNewPasswordIssue("short", "short", policy)).toBe("minLength");
    expect(
      getNewPasswordIssue("password", "password", { ...policy, password_requirements: "letters_and_digits" }),
    ).toBe("policy");
    expect(getNewPasswordIssue("password1", "password2", policy)).toBe("mismatch");
    expect(getNewPasswordIssue("password1", "password1", policy)).toBeNull();
  });
});
