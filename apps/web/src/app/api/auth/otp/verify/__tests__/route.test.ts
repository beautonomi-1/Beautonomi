import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockCheckOtpVerifyRateLimit = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock("@/lib/rate-limit/otp-verify", () => ({
  checkOtpVerifyRateLimit: (...args: unknown[]) => mockCheckOtpVerifyRateLimit(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({
    auth: { verifyOtp: mockVerifyOtp },
  })),
}));

describe("POST /api/auth/otp/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckOtpVerifyRateLimit.mockResolvedValue({ allowed: true, remaining: 7 });
  });

  function post(body: Record<string, unknown>) {
    return new NextRequest("http://localhost/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns a generic 429 when the store rejects the identity", async () => {
    mockCheckOtpVerifyRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
    });
    const { POST } = await import("../route");
    const res = await POST(post({ email: "a@b.com", token: "123456", type: "email" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe("Too many attempts. Please try again later.");
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("returns a generic error when verify fails", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "otp_expired" } });
    const { POST } = await import("../route");
    const res = await POST(post({ email: "a@b.com", token: "000000", type: "email" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Invalid or expired code.");
  });

  it("returns session tokens on success", async () => {
    mockVerifyOtp.mockResolvedValue({
      data: {
        user: { id: "u1", identities: [{ provider: "email" }] },
        session: {
          access_token: "at",
          refresh_token: "rt",
          expires_in: 3600,
          expires_at: 1,
        },
      },
      error: null,
    });
    const { POST } = await import("../route");
    const res = await POST(post({ email: "a@b.com", token: "123456", type: "email" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.session.access_token).toBe("at");
    expect(json.data.identities).toEqual([{ provider: "email" }]);
  });
});
