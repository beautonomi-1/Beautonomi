import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();

vi.mock("../store", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  getClientIp: () => "203.0.113.1",
}));

import { checkHoldRateLimit } from "../hold-creation";

describe("checkHoldRateLimit", () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 2, retryAfterSeconds: 60 });
  });

  it("uses hold-user limiter for signed-in users", async () => {
    const req = new Request("https://example.com");
    await checkHoldRateLimit(req, "fp-abc", { userId: "user-1" });

    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "hold-user" }),
      "user-1",
    );
    expect(checkRateLimit).not.toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "hold-fp" }),
      expect.anything(),
    );
  });

  it("uses hold-fp limiter for guests with fingerprint", async () => {
    const req = new Request("https://example.com");
    await checkHoldRateLimit(req, "fp-guest");

    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "hold-fp" }),
      "fp-guest",
    );
  });

  it("skips user/fingerprint limits when skipClientLimit is true", async () => {
    const req = new Request("https://example.com");
    await checkHoldRateLimit(req, "fp-guest", { userId: "user-1", skipClientLimit: true });

    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "hold-ip" }),
      "203.0.113.1",
    );
  });
});
