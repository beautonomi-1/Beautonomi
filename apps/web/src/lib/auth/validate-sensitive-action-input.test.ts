import { describe, expect, it } from "vitest";
import type { UserAuthSecurityState } from "@/lib/auth/user-auth-security-state";
import { validateSensitiveActionCredentials } from "./validate-sensitive-action-input";

const passwordlessWithEmail: UserAuthSecurityState = {
  has_password: false,
  has_mailable_email: true,
  has_phone: false,
  email_is_placeholder: false,
  password_changed_at: null,
  policy: {
    email_provider_enabled: true,
    secure_email_change: true,
    secure_password_change: true,
    require_current_password: true,
    prevent_leaked_passwords: false,
    minimum_password_length: 8,
    password_requirements: "none",
    email_otp_expiration_seconds: 3600,
    email_otp_length: 6,
    phone_provider_enabled: true,
    phone_confirmations_enabled: true,
    sms_provider: "twilio",
    sms_otp_expiration_seconds: 60,
    sms_otp_length: 6,
  },
};

const withPassword: UserAuthSecurityState = {
  ...passwordlessWithEmail,
  has_password: true,
};

describe("validateSensitiveActionCredentials", () => {
  it("requires password or verification code", () => {
    const result = validateSensitiveActionCredentials(
      passwordlessWithEmail,
      { password: "", verificationNonce: "" },
      "deactivate your account",
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.status).toBe(400);
      expect(result.message).toMatch(/Password or verification code/i);
    }
  });

  it("rejects password-only confirmation for passwordless accounts", () => {
    const result = validateSensitiveActionCredentials(
      passwordlessWithEmail,
      { password: "secret", verificationNonce: "" },
      "delete your account",
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.message).toMatch(/does not have a password/i);
    }
  });

  it("rejects OTP when no mailable email or phone", () => {
    const result = validateSensitiveActionCredentials(
      { ...passwordlessWithEmail, has_mailable_email: false, has_phone: false },
      { password: "", verificationNonce: "123456" },
      "deactivate your account",
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.message).toMatch(/email or phone/i);
    }
  });

  it("allows OTP for passwordless accounts with email", () => {
    const result = validateSensitiveActionCredentials(
      passwordlessWithEmail,
      { password: "", verificationNonce: "123456" },
      "deactivate your account",
    );
    expect(result).toEqual({ ok: true });
  });

  it("allows password for accounts with a password", () => {
    const result = validateSensitiveActionCredentials(
      withPassword,
      { password: "secret", verificationNonce: "" },
      "deactivate your account",
    );
    expect(result).toEqual({ ok: true });
  });
});
