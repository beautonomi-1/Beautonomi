import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProviderGiftCardRedemptions } from "../gift-card-provider-redemptions";

const fetchAllPaged = vi.fn();
const fetchInIdChunks = vi.fn();

vi.mock("@/lib/provider-ops/postgrest-unbounded", () => ({
  fetchAllPaged: (...args: unknown[]) => fetchAllPaged(...args),
  fetchInIdChunks: (...args: unknown[]) => fetchInIdChunks(...args),
}));

describe("fetchProviderGiftCardRedemptions", () => {
  const providerId = "11111111-1111-4111-8111-111111111111";
  const fromDate = new Date("2026-01-01T00:00:00.000Z");
  const toDate = new Date("2026-01-31T23:59:59.999Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes booking, product order, and till sale captures with reference labels", async () => {
    fetchAllPaged.mockResolvedValue([
      {
        id: "r-booking",
        gift_card_id: "gc-1",
        booking_id: "b-1",
        amount: 40,
        currency: "ZAR",
        captured_at: "2026-01-15T10:00:00.000Z",
      },
      {
        id: "r-order",
        gift_card_id: "gc-2",
        product_order_id: "po-1",
        amount: 25,
        currency: "ZAR",
        captured_at: "2026-01-16T10:00:00.000Z",
      },
      {
        id: "r-sale",
        gift_card_id: "gc-3",
        sale_id: "sale-1",
        amount: 15,
        currency: "ZAR",
        captured_at: "2026-01-17T10:00:00.000Z",
      },
    ]);

    fetchInIdChunks
      .mockResolvedValueOnce([
        { id: "b-1", gift_card_id: "gc-1", booking_number: "BK-9", location_id: "loc-1" },
      ])
      .mockResolvedValueOnce([{ id: "po-1", order_number: "ORD-7", collection_location_id: "loc-1" }])
      .mockResolvedValueOnce([{ id: "sale-1", location_id: "loc-1" }])
      .mockResolvedValueOnce([
        { id: "gc-1", code: "GIFT1" },
        { id: "gc-2", code: "GIFT2" },
        { id: "gc-3", code: "GIFT3" },
      ]);

    const supabase = {} as never;
    const { rows } = await fetchProviderGiftCardRedemptions(supabase, {
      providerId,
      fromDate,
      toDate,
    });

    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === "r-booking")?.reference_label).toBe("Booking BK-9");
    expect(rows.find((r) => r.id === "r-order")?.reference_label).toBe("Order ORD-7");
    expect(rows.find((r) => r.id === "r-sale")?.reference_label).toBe("Till sale");
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(80);
  });
});
