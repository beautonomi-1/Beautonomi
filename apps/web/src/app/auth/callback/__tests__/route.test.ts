/**
 * Auth callback GET: OAuth code exchange and recovery (token_hash + type) redirects.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to reset-password when token_hash and type=recovery and verifyOtp succeeds", async () => {
    const mockVerifyOtp = vi.fn().mockResolvedValue({ error: null });
    mockGetSupabaseServer.mockResolvedValue({
      auth: {
        verifyOtp: mockVerifyOtp,
      },
    });

    const { GET } = await import("../route");
    const req = new NextRequest(
      "https://app.example.com/auth/callback?token_hash=abc123&type=recovery"
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.example.com/account-settings/login-and-security/reset-password"
    );
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: "abc123",
      type: "recovery",
    });
  });

  it("redirects to booking with error when token_hash and type=recovery but verifyOtp fails", async () => {
    const mockVerifyOtp = vi.fn().mockResolvedValue({
      error: { message: "Invalid or expired link" },
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { verifyOtp: mockVerifyOtp },
    });

    const { GET } = await import("../route");
    const req = new NextRequest(
      "https://app.example.com/auth/callback?token_hash=bad&type=recovery"
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/booking?error=");
    expect(location).toContain(encodeURIComponent("Invalid or expired link"));
  });

  it("redirects to booking when error param is present", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest(
      "https://app.example.com/auth/callback?error=access_denied&error_description=User+cancelled"
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/booking?error=");
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("redirects to next param when token_hash and type=signup and verifyOtp succeeds", async () => {
    const mockVerifyOtp = vi.fn().mockResolvedValue({ error: null });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { verifyOtp: mockVerifyOtp },
    });

    const { GET } = await import("../route");
    const req = new NextRequest(
      "https://app.example.com/auth/callback?token_hash=xyz&type=signup&next=/provider"
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/provider");
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: "xyz", type: "signup" });
  });

  it("redirects to booking with missing_code when no code and no token_hash", async () => {
    mockGetSupabaseServer.mockResolvedValue({ auth: {} });

    const { GET } = await import("../route");
    const req = new NextRequest("https://app.example.com/auth/callback");
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/booking?error=missing_code");
  });
});
