import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countRefundableSuccessPaymentTxsForTenant,
  fetchRefundableSuccessPaymentTxsForTenant,
} from "../refundable-payment-transactions";

const mockFetchOrphans = vi.fn();

vi.mock("@/lib/admin/payment-transactions-tenant-scope", () => ({
  fetchOrphanRefundPaymentTxsForTenant: (...args: unknown[]) => mockFetchOrphans(...args),
}));

function makeSupabase(bookingCount: number, bookingRows: unknown[] = []) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (v: unknown) => void) => {
      resolve({ count: bookingCount, data: bookingRows, error: null });
    },
  };
  return {
    from: () => chain,
  };
}

describe("refundable-payment-transactions", () => {
  beforeEach(() => {
    mockFetchOrphans.mockReset();
  });

  it("counts booking-linked success rows plus tenant orphan rows", async () => {
    mockFetchOrphans.mockResolvedValue([{ id: "orph-1" }, { id: "orph-2" }]);
    const supabase = makeSupabase(3);

    const count = await countRefundableSuccessPaymentTxsForTenant(supabase as never, "tenant-1");

    expect(count).toBe(5);
    expect(mockFetchOrphans).toHaveBeenCalledWith(supabase, "tenant-1", {
      startDate: null,
      endDate: null,
      status: "success",
      transactionType: null,
    });
  });

  it("merges and sorts refundable rows newest first", async () => {
    mockFetchOrphans.mockResolvedValue([
      { id: "orph-1", amount: 50, status: "success", created_at: "2026-01-02T00:00:00Z" },
    ]);
    const supabase = makeSupabase(0, [
      { id: "bk-1", amount: 100, status: "success", created_at: "2026-01-03T00:00:00Z" },
    ]);

    const rows = await fetchRefundableSuccessPaymentTxsForTenant(supabase as never, "tenant-1", 10);

    expect(rows.map((r) => r.id)).toEqual(["bk-1", "orph-1"]);
  });
});
