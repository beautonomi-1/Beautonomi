/**
 * Auth client helpers: signup OTP verification (`verifySignupEmailOtp`).
 *
 * Validates the contract used by web/customer/provider signup screens after the email
 * confirmation link UX was replaced with a numeric OTP code (Supabase "Confirm signup"
 * template + `verifyOtp({ type: "signup" })`).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerifyOtp = vi.fn();
const mockGetSupabaseClient = vi.fn(() => ({
  auth: {
    verifyOtp: mockVerifyOtp,
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
