/**
 * @jest-environment node
 */
import type { ApiResponse } from "@beautonomi/types";

jest.mock("@/lib/api-client", () => ({
  api: { get: jest.fn() },
}));

jest.mock("@/lib/payments/safeLog", () => ({
  safeLog: jest.fn(),
  safeWarn: jest.fn(),
}));

import { api } from "@/lib/api-client";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";

const apiGetMock = api.get as jest.MockedFunction<typeof api.get>;

function ok<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}
function fail(message = "boom"): ApiResponse<unknown> {
  return { data: null, error: { message } };
}

describe("verifyPaystackWithRetry (customer)", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });

  it("returns success on first attempt when status=success", async () => {
    apiGetMock.mockResolvedValueOnce(ok({ status: "success", bookingId: "b1" }));
    const res = await verifyPaystackWithRetry("ref-1", { maxAttempts: 5, delayMs: 0 });
    expect(res.status).toBe("success");
    expect(res.attempts).toBe(1);
    expect(apiGetMock).toHaveBeenCalledTimes(1);
  });

  it("returns failed when paystackStatus=failed", async () => {
    apiGetMock.mockResolvedValueOnce(ok({ paystackStatus: "failed", message: "Declined" }));
    const res = await verifyPaystackWithRetry("ref-2", { maxAttempts: 5, delayMs: 0 });
    expect(res.status).toBe("failed");
    expect(res.errorMessage).toBe("Declined");
    expect(res.attempts).toBe(1);
  });

  it("retries pending then resolves on subsequent success", async () => {
    apiGetMock
      .mockResolvedValueOnce(ok({ status: "pending" }))
      .mockResolvedValueOnce(ok({ status: "pending" }))
      .mockResolvedValueOnce(ok({ verified: true }));
    const res = await verifyPaystackWithRetry("ref-3", { maxAttempts: 5, delayMs: 0 });
    expect(res.status).toBe("success");
    expect(res.attempts).toBe(3);
  });

  it("returns pending when all attempts return pending", async () => {
    apiGetMock.mockResolvedValue(ok({ status: "pending" }));
    const res = await verifyPaystackWithRetry("ref-4", { maxAttempts: 3, delayMs: 0 });
    expect(res.status).toBe("pending");
    expect(res.attempts).toBe(3);
    expect(apiGetMock).toHaveBeenCalledTimes(3);
  });

  it("returns unknown when no payload data", async () => {
    apiGetMock.mockResolvedValue(ok(null));
    const res = await verifyPaystackWithRetry("ref-5", { maxAttempts: 2, delayMs: 0 });
    expect(res.status).toBe("unknown");
    expect(res.attempts).toBe(2);
  });

  it("retries past transient API errors, eventually surfaces unknown + lastErr", async () => {
    apiGetMock.mockResolvedValue(fail("Network error"));
    const res = await verifyPaystackWithRetry("ref-6", { maxAttempts: 2, delayMs: 0 });
    expect(res.status).toBe("unknown");
    expect(res.errorMessage).toBe("Network error");
    expect(res.attempts).toBe(2);
  });

  it("retries past thrown exceptions, eventually surfaces unknown + lastErr", async () => {
    apiGetMock.mockRejectedValue(new Error("fetch failed"));
    const res = await verifyPaystackWithRetry("ref-7", { maxAttempts: 2, delayMs: 0 });
    expect(res.status).toBe("unknown");
    expect(res.errorMessage).toBe("fetch failed");
    expect(res.attempts).toBe(2);
  });

  it("short-circuits when reference is empty", async () => {
    const res = await verifyPaystackWithRetry("   ", { maxAttempts: 3, delayMs: 0 });
    expect(res.status).toBe("unknown");
    expect(res.attempts).toBe(0);
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it("uses a custom endpoint when provided", async () => {
    apiGetMock.mockResolvedValueOnce(ok({ verified: true }));
    await verifyPaystackWithRetry("ref-8", {
      endpoint: "/api/paystack/verify-reference",
      maxAttempts: 1,
      delayMs: 0,
    });
    const call = apiGetMock.mock.calls[0]?.[0] ?? "";
    expect(call).toContain("/api/paystack/verify-reference");
    expect(call).toContain("reference=ref-8");
  });
});
