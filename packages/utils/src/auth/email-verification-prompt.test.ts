import { describe, expect, it } from "vitest";
import {
  resolveMailableAccountEmail,
  resolveProfileEmailVerificationState,
  shouldShowEmailVerificationBanner,
} from "./email-verification-prompt";

describe("email-verification-prompt", () => {
  it("prefers the first mailable email among candidates", () => {
    expect(
      resolveMailableAccountEmail("user-abc@beautonomi.local", "owner@salon.co.za"),
    ).toBe("owner@salon.co.za");
    expect(resolveMailableAccountEmail("user-abc@beautonomi.local", null)).toBeNull();
  });

  it("treats phone-only placeholder accounts as verification-satisfied", () => {
    const state = resolveProfileEmailVerificationState({
      profileEmail: "user-abc@beautonomi.local",
      authEmail: null,
      emailVerifiedFlag: false,
      emailConfirmedAt: null,
    });
    expect(state.hasMailableEmail).toBe(false);
    expect(state.verificationSatisfied).toBe(true);
    expect(state.verificationRequired).toBe(false);
  });

  it("requires verification when a mailable email is unconfirmed", () => {
    const state = resolveProfileEmailVerificationState({
      profileEmail: "owner@salon.co.za",
      emailVerifiedFlag: false,
      emailConfirmedAt: null,
    });
    expect(state.verificationRequired).toBe(true);
    expect(state.verificationSatisfied).toBe(false);
  });

  it("does not show banner for phone-only signup", () => {
    expect(
      shouldShowEmailVerificationBanner({
        profileEmail: "user-abc@beautonomi.local",
        authEmail: null,
        emailConfirmedAt: null,
        accountCreatedAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });

  it("shows banner for recent accounts with unverified mailable email", () => {
    expect(
      shouldShowEmailVerificationBanner({
        profileEmail: "owner@salon.co.za",
        emailConfirmedAt: null,
        accountCreatedAt: new Date().toISOString(),
      }),
    ).toBe(true);
  });

  it("shows banner when auth has unverified mailable email even if profile has placeholder", () => {
    expect(
      shouldShowEmailVerificationBanner({
        authEmail: "owner@salon.co.za",
        profileEmail: "user-abc@beautonomi.local",
        emailConfirmedAt: null,
        accountCreatedAt: new Date().toISOString(),
      }),
    ).toBe(true);
  });

  it("hides banner when mailable email is already verified", () => {
    expect(
      shouldShowEmailVerificationBanner({
        profileEmail: "owner@salon.co.za",
        emailConfirmedAt: "2026-06-01T00:00:00.000Z",
        accountCreatedAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });
});
