/**
 * Auth callback GET: OAuth code exchange and recovery (token_hash + type) redirects.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetSupabaseServer = vi.fn();
const mockGetUserRoleServer = vi.fn();
const mockGetPortalForUser = vi.fn();
const mockGetDefaultRouteForPortal = vi.fn();
const mockResolvePortalAwareReturnPathname = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: any[]) => mockGetSupabaseServer(...args),
}));
vi.mock("@/lib/auth/role-server", () => ({
  getUserRoleServer: (...args: any[]) => mockGetUserRoleServer(...args),
}));
vi.mock("@/lib/auth/role", () => ({
  getPortalForUser: (...args: any[]) => mockGetPortalForUser(...args),
  getDefaultRouteForPortal: (...args: any[]) => mockGetDefaultRouteForPortal(...args),
}));
vi.mock("@/lib/auth/post-login-return-path", () => ({
  resolvePortalAwareReturnPathname: (...args: any[]) => mockResolvePortalAwareReturnPathname(...args),
}));

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserRoleServer.mockResolvedValue({ role: "customer", provider_status: null });
    mockGetPortalForUser.mockReturnValue("customer");
    mockGetDefaultRouteForPortal.mockReturnValue("/bookings");
    mockResolvePortalAwareReturnPathname.mockImplementation((_portal: string, pathname: string) => pathname);
  });

  it(
    "redirects to reset-password when token_hash and type=recovery and verifyOtp succeeds",
    async () => {
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
    },
    30_000
  );

  it("redirects to login with error when token_hash and type=recovery but verifyOtp fails", async () => {
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
    expect(location).toContain("/login?error=");
    expect(new URL(location).searchParams.get("error")).toBe("Invalid or expired link");
  });

  it("redirects to login and preserves next when error param is present", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest(
      "https://app.example.com/auth/callback?error=access_denied&error_description=User+cancelled&next=%2Fprovider%2Fget-started"
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login?error=");
    expect(location).toContain("next=%2Fprovider%2Fget-started");
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

  it("redirects to login with missing_code when no code and no token_hash", async () => {
    mockGetSupabaseServer.mockResolvedValue({ auth: {} });

    const { GET } = await import("../route");
    const req = new NextRequest("https://app.example.com/auth/callback");
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?error=missing_code");
  });

  it("preserves query params on allowed OAuth next paths", async () => {
    const mockExchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: "token" }, user: { id: "user-a", user_metadata: {} } },
      error: null,
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { exchangeCodeForSession: mockExchangeCodeForSession },
      from: () => ({
        update: () => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });
    const { GET } = await import("../route");
    const req = new NextRequest(
      "https://app.example.com/auth/callback?code=ok&next=%2Fbook%2Fcontinue%3Fhold_id%3Dhold-123"
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/book/continue?hold_id=hold-123");
  });

  it("preserves non-dashboard admin OAuth next paths through the dedicated admin login", async () => {
    const mockExchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: "token" }, user: { id: "admin-a", user_metadata: {} } },
      error: null,
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { exchangeCodeForSession: mockExchangeCodeForSession },
      from: () => ({
        update: () => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });

    const { GET } = await import("../route");
    const req = new NextRequest(
      "https://app.example.com/auth/callback?code=ok&next=%2Fadmin%2Ffinance%3Ftab%3Dledger"
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.example.com/admin/login?next=%2Fadmin%2Ffinance%3Ftab%3Dledger"
    );
  });
});
