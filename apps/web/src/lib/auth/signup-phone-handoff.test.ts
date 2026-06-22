import { describe, expect, it, beforeEach } from "vitest";
import {
  applySignupPhoneHandoffToForm,
  clearSignupPhoneHandoff,
  readAndClearCustomerPhoneHandoff,
  readSignupPhoneHandoff,
  writeSignupPhoneHandoff,
} from "./signup-phone-handoff";

describe("signup-phone-handoff", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("writes and reads a phone handoff within TTL", () => {
    writeSignupPhoneHandoff("+27821234567");
    const handoff = readSignupPhoneHandoff();
    expect(handoff?.phoneE164).toBe("+27821234567");
    expect(handoff?.method).toBe("phone_otp");
  });

  it("applies handoff to provider onboarding form and clears storage", () => {
    writeSignupPhoneHandoff("+27829876543");
    const form: { owner_phone?: string; phone?: string; phone_verified?: boolean } = {};
    applySignupPhoneHandoffToForm(form);
    expect(form.owner_phone).toBe("+27829876543");
    expect(form.phone_verified).toBe(true);
    expect(readSignupPhoneHandoff()).toBeNull();
  });

  it("applies handoff to customer onboarding state", () => {
    writeSignupPhoneHandoff("+27829876543");
    const result = readAndClearCustomerPhoneHandoff();
    expect(result?.phoneE164).toBe("+27829876543");
    expect(result?.verified).toBe(true);
    expect(readAndClearCustomerPhoneHandoff()).toBeNull();
  });

  it("expires stale handoffs", () => {
    writeSignupPhoneHandoff("+27821111111");
    const raw = sessionStorage.getItem("beautonomi_signup_phone_handoff");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { verifiedAt: number };
    parsed.verifiedAt = Date.now() - 6 * 60 * 1000;
    sessionStorage.setItem("beautonomi_signup_phone_handoff", JSON.stringify(parsed));
    expect(readSignupPhoneHandoff()).toBeNull();
    clearSignupPhoneHandoff();
  });
});
