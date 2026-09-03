import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCheckRateLimit = vi.fn();
const mockGetClientIp = vi.fn(() => "203.0.113.9");

vi.mock("../store", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

describe("checkOtpVerifyRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue("203.0.113.9");
  });

  it("blocks when the identity limiter is exhausted", async () => {
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 10 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 42 });

    const { checkOtpVerifyRateLimit } = await import("../otp-verify");
    const result = await checkOtpVerifyRateLimit(
      new Request("http://localhost/api/auth/otp/verify"),
      "User@Example.com",
    );

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(42);
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ prefix: "otp-verify:identity" }),
      "user@example.com",
    );
  });

  it("blocks on IP before checking identity", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 15,
    });

    const { checkOtpVerifyRateLimit } = await import("../otp-verify");
    const result = await checkOtpVerifyRateLimit(
      new Request("http://localhost/api/auth/otp/verify"),
      "+27821234567",
    );

    expect(result.allowed).toBe(false);
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "otp-verify:ip" }),
      "203.0.113.9",
    );
  });
});
