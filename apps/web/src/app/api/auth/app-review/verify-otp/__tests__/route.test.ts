import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  APP_REVIEW_CUSTOMER_DEMO_EMAIL,
  APP_REVIEW_CUSTOMER_DEMO_UID,
  APP_REVIEW_DEMO_EMAIL,
  APP_REVIEW_DEMO_UID,
} from "@/lib/auth/app-review-demo";

const mockCheckSignInRateLimit = vi.fn();
const mockGenerateLink = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock("@/lib/rate-limit/sign-in", () => ({
  checkSignInRateLimit: (...args: unknown[]) => mockCheckSignInRateLimit(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: { generateLink: mockGenerateLink },
      verifyOtp: mockVerifyOtp,
    },
  }),
}));

describe("POST /api/auth/app-review/verify-otp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckSignInRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 });
    mockGenerateLink.mockImplementation(({ email }: { email: string }) =>
      Promise.resolve({
        data: { properties: { hashed_token: `hash-${email}` } },
        error: null,
      }),
    );
    mockVerifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
          expires_at: 123,
          token_type: "bearer",
          user: { id: "user-from-session" },
        },
      },
      error: null,
    });
  });

  async function post(body: Record<string, string>) {
    const { POST } = await import("../route");
    const req = new NextRequest("https://app.example.com/api/auth/app-review/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  it("issues a session for the customer demo phone", async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
          expires_at: 123,
          token_type: "bearer",
          user: { id: APP_REVIEW_CUSTOMER_DEMO_UID },
        },
      },
      error: null,
    });

    const res = await post({ phone: "+27716429097", otp: "246810" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: APP_REVIEW_CUSTOMER_DEMO_EMAIL,
    });
    expect(json.data.user.id).toBe(APP_REVIEW_CUSTOMER_DEMO_UID);
  });

  it("issues a session for the provider demo email", async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
          expires_at: 123,
          token_type: "bearer",
          user: { id: APP_REVIEW_DEMO_UID },
        },
      },
      error: null,
    });

    const res = await post({ email: APP_REVIEW_DEMO_EMAIL, otp: "246810" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: APP_REVIEW_DEMO_EMAIL,
    });
    expect(json.data.user.id).toBe(APP_REVIEW_DEMO_UID);
  });

  it("rejects invalid demo identifiers", async () => {
    const res = await post({ email: "other@example.com", otp: "246810" });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("INVALID_DEMO_ACCOUNT");
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it("rejects invalid demo OTP", async () => {
    const res = await post({ email: APP_REVIEW_CUSTOMER_DEMO_EMAIL, otp: "000000" });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("INVALID_OTP");
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });
});
