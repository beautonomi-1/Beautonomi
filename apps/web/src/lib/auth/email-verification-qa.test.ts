/**
 * QA matrix: phone-only signup must never surface email-verification prompts
 * for synthetic placeholder addresses.
 */
import { describe, expect, it } from "vitest";
import {
  resolveProfileEmailVerificationState,
  shouldShowEmailVerificationBanner,
} from "@beautonomi/utils";

const PLACEHOLDER = "user-550e8400-e29b-41d4-a716-446655440000@beautonomi.local";
const RECENT = new Date().toISOString();

describe("email verification QA — phone-only signup", () => {
  it("does not show global banner for placeholder-only accounts", () => {
    expect(
      shouldShowEmailVerificationBanner({
        profileEmail: PLACEHOLDER,
        authEmail: null,
        emailConfirmedAt: null,
        accountCreatedAt: RECENT,
      }),
    ).toBe(false);
  });

  it("does not require email verification in profile completion", () => {
    const state = resolveProfileEmailVerificationState({
      profileEmail: PLACEHOLDER,
      authEmail: null,
      emailVerifiedFlag: false,
      emailConfirmedAt: null,
    });
    expect(state.verificationRequired).toBe(false);
    expect(state.verificationSatisfied).toBe(true);
  });

  it("still requires verification after user adds a real email", () => {
    const state = resolveProfileEmailVerificationState({
      profileEmail: "owner@salon.co.za",
      authEmail: "owner@salon.co.za",
      emailVerifiedFlag: false,
      emailConfirmedAt: null,
    });
    expect(state.verificationRequired).toBe(true);
    expect(state.verificationSatisfied).toBe(false);
    expect(
      shouldShowEmailVerificationBanner({
        profileEmail: "owner@salon.co.za",
        authEmail: "owner@salon.co.za",
        emailConfirmedAt: null,
        accountCreatedAt: RECENT,
      }),
    ).toBe(true);
  });
});
