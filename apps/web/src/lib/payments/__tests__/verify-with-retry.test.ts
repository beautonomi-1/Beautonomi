import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFetcherGet = vi.fn();

vi.mock("@/lib/http/fetcher", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/fetcher")>();
  return {
    ...mod,
    fetcher: {
      get: (...args: unknown[]) => mockFetcherGet(...args),
    },
  };
});

describe("buildOnlineVerifyQuery", () => {
  it("includes reference only when session_id is absent", async () => {
    const { buildOnlineVerifyQuery } = await import("../verify-with-retry");
    expect(buildOnlineVerifyQuery("ref-abc")).toBe("reference=ref-abc");
    expect(buildOnlineVerifyQuery("ref-abc", "  ")).toBe("reference=ref-abc");
  });

  it("appends failed or cancelled redirect status", async () => {
    const { buildOnlineVerifyQuery } = await import("../verify-with-retry");
    expect(buildOnlineVerifyQuery("ref-abc", null, null, "cancelled")).toBe(
      "reference=ref-abc&status=cancelled",
    );
    expect(buildOnlineVerifyQuery("ref-abc", null, null, "ignored")).toBe("reference=ref-abc");
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

  it("keeps polling when the gateway succeeded but the booking is still unpaid", async () => {
    mockFetcherGet.mockResolvedValue({
      data: { status: "success", payment_status: "pending", bookingId: "b1" },
    });

    const { verifyWithRetry } = await import("../verify-with-retry");
    const result = await verifyWithRetry("ref-1", { maxAttempts: 2, delayMs: 1 });

    expect(result.status).toBe("pending");
    expect(result.attempts).toBe(2);
  });

  it("returns success when the booking payment is recorded", async () => {
    mockFetcherGet.mockResolvedValueOnce({
      data: { status: "success", payment_status: "paid", bookingId: "b1" },
    });

    const { verifyWithRetry } = await import("../verify-with-retry");
    const result = await verifyWithRetry("ref-1", { maxAttempts: 3, delayMs: 1 });

    expect(result.status).toBe("success");
    expect(result.attempts).toBe(1);
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

  it("keeps polling when verify-reference says the bank is still processing", async () => {
    mockFetcherGet.mockResolvedValue({
      data: { verified: false, status: "pending", paystackStatus: "ongoing" },
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

  it.each(["BOOKING_CANCELLED", "CHECKOUT_NO_LONGER_PAYABLE"] as const)(
    "returns failed immediately on terminal 409 code %s without retrying",
    async (code) => {
      const { FetchError } = await import("@/lib/http/fetcher");
      const { verifyWithRetry } = await import("../verify-with-retry");
      mockFetcherGet.mockRejectedValue(new FetchError("Terminal verify failure", 409, code));

      const result = await verifyWithRetry("ref-terminal", { maxAttempts: 5, delayMs: 1 });

      expect(result.status).toBe("failed");
      expect(result.attempts).toBe(1);
      expect(result.errorMessage).toBe("Terminal verify failure");
      expect(mockFetcherGet).toHaveBeenCalledTimes(1);
    },
  );

  it("retries other 409 responses that are not terminal verify codes", async () => {
    const { FetchError } = await import("@/lib/http/fetcher");
    mockFetcherGet.mockRejectedValue(new FetchError("Still racing", 409, "VERIFY_NOT_READY"));

    const { verifyWithRetry } = await import("../verify-with-retry");
    const result = await verifyWithRetry("ref-race", { maxAttempts: 2, delayMs: 1 });

    expect(result.status).toBe("unknown");
    expect(result.attempts).toBe(2);
    expect(mockFetcherGet).toHaveBeenCalledTimes(2);
  });
});

