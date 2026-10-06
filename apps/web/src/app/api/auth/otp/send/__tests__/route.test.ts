import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockCheckOtpSendRateLimit = vi.fn();
const mockNoteAuthAttempt = vi.fn();
const mockSignInWithOtp = vi.fn();

vi.mock("@/lib/rate-limit/otp-send", () => ({
  checkOtpSendRateLimit: (...args: unknown[]) => mockCheckOtpSendRateLimit(...args),
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/auth/auth-risk", () => ({
  noteAuthAttemptAndShouldChallenge: (...args: unknown[]) => mockNoteAuthAttempt(...args),
  authCaptchaConfigured: () => false,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({
    auth: { signInWithOtp: mockSignInWithOtp },
  })),
}));

describe("POST /api/auth/otp/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckOtpSendRateLimit.mockResolvedValue({ allowed: true, remaining: 5 });
    mockNoteAuthAttempt.mockResolvedValue({ requireCaptcha: false });
    mockSignInWithOtp.mockResolvedValue({ error: null });
  });

  function post(body: Record<string, unknown>) {
    return new NextRequest("http://localhost/api/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 429 with Retry-After when identity is rate limited", async () => {
    mockCheckOtpSendRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 45,
    });
    const { POST } = await import("../route");
    const res = await POST(post({ email: "a@b.com" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("sends email OTP when allowed", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ email: "a@b.com" }));
    expect(res.status).toBe(200);
    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "a@b.com" }),
    );
  });
});
