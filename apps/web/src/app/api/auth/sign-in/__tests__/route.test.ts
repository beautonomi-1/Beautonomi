import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../route";

const mockCheckSignInPasswordRateLimit = vi.fn();
const mockNoteSignInPasswordFailure = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockNoteAuthAttempt = vi.fn();

vi.mock("@/lib/rate-limit/sign-in-password", () => ({
  checkSignInPasswordRateLimit: (...args: unknown[]) => mockCheckSignInPasswordRateLimit(...args),
  noteSignInPasswordFailure: (...args: unknown[]) => mockNoteSignInPasswordFailure(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/auth/auth-risk", () => ({
  noteAuthAttemptAndShouldChallenge: (...args: unknown[]) => mockNoteAuthAttempt(...args),
  authCaptchaConfigured: () => false,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: vi.fn(),
  }),
}));

describe("POST /api/auth/sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNoteAuthAttempt.mockResolvedValue({ requireCaptcha: false });
    mockNoteSignInPasswordFailure.mockResolvedValue({ allowed: true, remaining: 9 });
  });

  it("returns 429 with Retry-After when password rate limit exceeded", async () => {
    mockCheckSignInPasswordRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 120,
    });

    const req = new Request("http://localhost/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret" }),
    });

    const res = await POST(req as import("next/server").NextRequest);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
  });
});
