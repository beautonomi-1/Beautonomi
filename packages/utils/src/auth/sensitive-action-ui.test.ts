import { describe, expect, it } from "vitest";
import type { AuthSecuritySnapshot } from "./sensitive-action-ui";
import {
  canVerifySensitiveActionWithCode,
  isAuthSecurityLoaded,
  sensitiveActionSubmitReady,
  userHasPassword,
} from "./sensitive-action-ui";

const passwordless: AuthSecuritySnapshot = {
  has_password: false,
  has_mailable_email: true,
  has_phone: false,
};

const withPassword: AuthSecuritySnapshot = {
  has_password: true,
  has_mailable_email: true,
  has_phone: false,
};

describe("sensitive-action-ui", () => {
  it("does not assume password while auth_security is still loading", () => {
    expect(isAuthSecurityLoaded(null)).toBe(false);
    expect(userHasPassword(null)).toBe(false);
    expect(sensitiveActionSubmitReady(null, { password: "x", verificationNonce: "" })).toBe(false);
  });

  it("treats only explicit has_password true as password accounts", () => {
    expect(userHasPassword(passwordless)).toBe(false);
    expect(userHasPassword(withPassword)).toBe(true);
    expect(userHasPassword(undefined)).toBe(false);
  });

  it("allows OTP verification for passwordless users with contact methods", () => {
    expect(canVerifySensitiveActionWithCode(passwordless)).toBe(true);
    expect(canVerifySensitiveActionWithCode({ ...passwordless, has_mailable_email: false })).toBe(false);
    expect(canVerifySensitiveActionWithCode(null)).toBe(false);
  });

  it("requires password or nonce depending on account type", () => {
    expect(
      sensitiveActionSubmitReady(withPassword, { password: "secret", verificationNonce: "" }),
    ).toBe(true);
    expect(
      sensitiveActionSubmitReady(passwordless, { password: "", verificationNonce: "123456" }),
    ).toBe(true);
    expect(
      sensitiveActionSubmitReady(passwordless, { password: "oops", verificationNonce: "" }),
    ).toBe(false);
  });
});
