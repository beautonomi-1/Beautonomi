/**
 * Auth client helpers: signup OTP verification (`verifySignupEmailOtp`).
 *
 * Validates the contract used by web/customer/provider signup screens after the email
 * confirmation link UX was replaced with a numeric OTP code (Supabase "Confirm signup"
 * template + `verifyOtp({ type: "signup" })`).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerifyOtp = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockGetSupabaseClient = vi.fn(() => ({
  auth: {
    verifyOtp: mockVerifyOtp,
    resetPasswordForEmail: mockResetPasswordForEmail,
  },
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));

describe("verifySignupEmailOtp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls supabase verifyOtp with email + token and type 'signup'", async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { session: { access_token: "abc", refresh_token: "def" }, user: null },
      error: null,
    });
    const { verifySignupEmailOtp } = await import("../auth");

    const result = await verifySignupEmailOtp("user@example.com", "123456");

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      token: "123456",
      type: "signup",
    });
    expect(result).toMatchObject({
      session: expect.objectContaining({ access_token: "abc" }),
    });
  });

  it("trims the email and strips non-digits from the token before calling Supabase", async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { session: null, user: { id: "u1" } },
      error: null,
    });
    const { verifySignupEmailOtp } = await import("../auth");

    await verifySignupEmailOtp("  user@example.com  ", " 12 34-56 ");

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      token: "123456",
      type: "signup",
    });
  });

  it("throws when Supabase returns an error", async () => {
    mockVerifyOtp.mockResolvedValue({
      data: null,
      error: { message: "Invalid or expired token" },
    });
    const { verifySignupEmailOtp } = await import("../auth");

    await expect(
      verifySignupEmailOtp("user@example.com", "000000"),
    ).rejects.toThrow("Invalid or expired token");
  });
});

describe("resetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tags the callback redirect as recovery so a PKCE code lands on the reset page", async () => {
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const { resetPassword } = await import("../auth");

    await resetPassword("user@example.com");

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
  });

  it("carries next through the callback so the link path returns where the code path does", async () => {
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const { resetPassword } = await import("../auth");

    await resetPassword("user@example.com", "/account-settings/login-and-security");

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery&next=%2Faccount-settings%2Flogin-and-security`,
    });
  });
});

describe("verifyPasswordRecoveryOtp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies the emailed code with type 'recovery'", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { session: { access_token: "abc" } }, error: null });
    const { verifyPasswordRecoveryOtp } = await import("../auth");

    await verifyPasswordRecoveryOtp("  user@example.com ", "691 960");

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      token: "691960",
      type: "recovery",
    });
  });

  it("throws when the code is rejected", async () => {
    mockVerifyOtp.mockResolvedValue({ data: null, error: { message: "Token has expired or is invalid" } });
    const { verifyPasswordRecoveryOtp } = await import("../auth");

    await expect(verifyPasswordRecoveryOtp("user@example.com", "000000")).rejects.toThrow(
      "Token has expired or is invalid",
    );
  });
});
