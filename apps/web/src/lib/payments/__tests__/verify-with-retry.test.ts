import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFetcherGet = vi.fn();

vi.mock("@/lib/http/fetcher", () => ({
  fetcher: {
    get: (...args: unknown[]) => mockFetcherGet(...args),
  },
  FetchError: class extends Error {},
}));

describe("buildOnlineVerifyQuery", () => {
  it("includes reference only when session_id is absent", async () => {
    const { buildOnlineVerifyQuery } = await import("../verify-with-retry");
    expect(buildOnlineVerifyQuery("ref-abc")).toBe("reference=ref-abc");
    expect(buildOnlineVerifyQuery("ref-abc", "  ")).toBe("reference=ref-abc");
  });

  it("appends session_id for Stripe Checkout returns", async () => {
    const { buildOnlineVerifyQuery } = await import("../verify-with-retry");
    expect(buildOnlineVerifyQuery("ref-abc", "cs_test_123")).toBe(
      "reference=ref-abc&session_id=cs_test_123",
    );
  });
});

describe("verifyWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes session_id on verify GET for Stripe regions", async () => {
    mockFetcherGet.mockResolvedValueOnce({
      data: { status: "success" },
    });

    const { verifyWithRetry } = await import("../verify-with-retry");
    await verifyWithRetry("ref-stripe", {
      maxAttempts: 1,
      delayMs: 1,
      sessionId: "cs_live_xyz",
    });

    expect(mockFetcherGet).toHaveBeenCalledWith(
      "/api/paystack/verify?reference=ref-stripe&session_id=cs_live_xyz",
      expect.objectContaining({ staleTimeMs: 0 }),
    );
  });

  it("returns success immediately when verify succeeds", async () => {
    mockFetcherGet.mockResolvedValueOnce({
      data: { status: "success", type: "product_order" },
    });

    const { verifyWithRetry } = await import("../verify-with-retry");
    const result = await verifyWithRetry("ref-1", { maxAttempts: 3, delayMs: 1 });

    expect(result.status).toBe("success");
    expect(result.attempts).toBe(1);
  });

  it("retries pending responses and returns unknown after max attempts", async () => {
    mockFetcherGet.mockResolvedValue({
      data: { status: "pending", message: "still processing" },
    });

    const { verifyWithRetry } = await import("../verify-with-retry");
    const result = await verifyWithRetry("ref-1", { maxAttempts: 2, delayMs: 1 });

    expect(result.status).toBe("pending");
    expect(result.attempts).toBe(2);
  });

  it("returns failed when endpoint reports failed status", async () => {
    mockFetcherGet.mockResolvedValueOnce({
      data: { status: "failed", message: "Payment failed" },
    });

    const { verifyWithRetry } = await import("../verify-with-retry");
    const result = await verifyWithRetry("ref-1", { maxAttempts: 3, delayMs: 1 });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("Payment failed");
  });
});

