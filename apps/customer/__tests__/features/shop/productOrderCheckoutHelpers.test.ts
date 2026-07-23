/**
 * @jest-environment node
 */
import {
  createProductOrderIdempotencyKey,
  isCreateOrderTransientError,
  pollProductOrderPaid,
  recoverRecentProductOrderForProvider,
  toCreateOrderApiError,
} from "@/features/shop/productOrderCheckoutHelpers";
import { api } from "@/lib/api-client";

jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
  },
}));

const apiGetMock = api.get as jest.Mock;

describe("productOrderCheckoutHelpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createProductOrderIdempotencyKey", () => {
    it("returns a UUID-shaped string", () => {
      const key = createProductOrderIdempotencyKey();
      expect(key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe("isCreateOrderTransientError", () => {
    it("returns false for null/undefined", () => {
      expect(isCreateOrderTransientError(null)).toBe(false);
      expect(isCreateOrderTransientError(undefined)).toBe(false);
    });

    it("returns true for transient network-style errors", () => {
      expect(isCreateOrderTransientError({ message: "Network request failed" })).toBe(true);
    });

    it("returns false for validation errors", () => {
      expect(isCreateOrderTransientError({ message: "Invalid cart", code: "VALIDATION_ERROR" })).toBe(
        false,
      );
    });
  });

  describe("pollProductOrderPaid", () => {
    it("returns true when payment_status becomes paid", async () => {
      const fetchOrderDetail = jest
        .fn()
        .mockResolvedValueOnce({ data: { payment_status: "pending" }, error: null })
        .mockResolvedValueOnce({ data: { payment_status: "paid" }, error: null });

      const paid = await pollProductOrderPaid(fetchOrderDetail, "order-1", {
        maxAttempts: 3,
        intervalMs: 1,
      });

      expect(paid).toBe(true);
      expect(fetchOrderDetail).toHaveBeenCalledTimes(2);
    });

    it("returns false when order never becomes paid", async () => {
      const fetchOrderDetail = jest.fn().mockResolvedValue({
        data: { payment_status: "pending" },
        error: null,
      });

      const paid = await pollProductOrderPaid(fetchOrderDetail, "order-2", {
        maxAttempts: 2,
        intervalMs: 1,
      });

      expect(paid).toBe(false);
      expect(fetchOrderDetail).toHaveBeenCalledTimes(2);
    });
  });

  describe("recoverRecentProductOrderForProvider", () => {
    it("returns the newest matching non-failed order for the provider", async () => {
      const now = Date.now();
      apiGetMock.mockResolvedValue({
        data: {
          orders: [
            {
              id: "old",
              provider: { id: "prov-1" },
              created_at: new Date(now - 10 * 60 * 1000).toISOString(),
              payment_status: "paid",
              status: "confirmed",
            },
            {
              id: "recent",
              provider: { id: "prov-1" },
              created_at: new Date(now - 60 * 1000).toISOString(),
              payment_status: "pending",
              status: "pending",
            },
          ],
        },
        error: null,
      });

      const order = await recoverRecentProductOrderForProvider("prov-1");
      expect(order?.id).toBe("recent");
      expect(apiGetMock).toHaveBeenCalledWith("/api/me/orders?limit=10");
    });

    it("returns null when API errors", async () => {
      apiGetMock.mockResolvedValue({ data: null, error: "Server error" });
      await expect(recoverRecentProductOrderForProvider("prov-1")).resolves.toBeNull();
    });
  });

  describe("toCreateOrderApiError", () => {
    it("extracts message and code from structured errors", () => {
      expect(
        toCreateOrderApiError({ message: "Out of stock", code: "OUT_OF_STOCK" }, "fallback"),
      ).toEqual({ message: "Out of stock", code: "OUT_OF_STOCK" });
    });

    it("falls back when message is empty", () => {
      expect(toCreateOrderApiError({ message: "   " }, "Could not create order")).toEqual({
        message: "Could not create order",
        code: undefined,
      });
    });
  });
});
