import { beforeEach, describe, expect, it, vi } from "vitest";

const recalculateMock = vi.fn().mockResolvedValue({ points: 100, badge_id: null });

vi.mock("@/lib/services/provider-gamification", () => ({
  recalculateProviderGamification: (...args: unknown[]) => recalculateMock(...args),
}));

import { syncProviderGamification } from "../ensure-provider-gamification-synced";

const alignedSignals = {
  completedBookings: 5,
  storedBookings: 5,
  reviewCount: 2,
  storedReviewCount: 2,
  ratingAverage: 4.5,
  storedRatingAverage: 4.5,
  transactionCount: 8,
  hasProviderPointsRow: true,
};

describe("syncProviderGamification", () => {
  beforeEach(() => {
    recalculateMock.mockClear();
  });

  it("no-ops when signals are healthy and not forced", async () => {
    const admin = { from: vi.fn(), rpc: vi.fn() };
    const result = await syncProviderGamification(admin as never, "provider-1", alignedSignals);
    expect(result.healed).toBe(false);
    expect(recalculateMock).not.toHaveBeenCalled();
  });

  it("backfills, syncs bookings, and recalculates when ledger is empty", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const admin = {
      rpc,
      from: vi.fn(() => ({
        update,
      })),
    };

    const result = await syncProviderGamification(admin as never, "provider-1", {
      completedBookings: 3,
      storedBookings: 1,
      reviewCount: 0,
      storedReviewCount: 0,
      ratingAverage: 0,
      storedRatingAverage: 0,
      transactionCount: 0,
      hasProviderPointsRow: false,
    });

    expect(result.healed).toBe(true);
    expect(result.transactionsBackfilled).toBe(true);
    expect(rpc).toHaveBeenCalledWith("backfill_provider_point_transactions", {
      p_provider_id: "provider-1",
    });
    expect(update).toHaveBeenCalledWith({ total_bookings: 3 });
    expect(recalculateMock).toHaveBeenCalledWith("provider-1");
  });

  it("syncs review stats when live count differs from stored", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const admin = {
      rpc: vi.fn(),
      from: vi.fn(() => ({ update })),
    };

    const result = await syncProviderGamification(admin as never, "provider-1", {
      ...alignedSignals,
      reviewCount: 3,
      storedReviewCount: 1,
      ratingAverage: 4.67,
      storedRatingAverage: 4,
      transactionCount: 8,
    });

    expect(result.healed).toBe(true);
    expect(result.reviewsSynced).toBe(true);
    expect(update).toHaveBeenCalledWith({
      review_count: 3,
      rating_average: 4.67,
    });
    expect(recalculateMock).toHaveBeenCalledWith("provider-1");
  });

  it("force sync updates bookings even when counts already match", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      rpc: vi.fn(),
      from: vi.fn(() => ({
        update: vi.fn(() => ({ eq: updateEq })),
      })),
    };

    const result = await syncProviderGamification(
      admin as never,
      "provider-1",
      {
        ...alignedSignals,
        reviewCount: 0,
        storedReviewCount: 0,
        ratingAverage: 0,
        storedRatingAverage: 0,
        transactionCount: 10,
      },
      { force: true },
    );

    expect(result.healed).toBe(true);
    expect(result.transactionsBackfilled).toBe(false);
    expect(recalculateMock).toHaveBeenCalledWith("provider-1");
  });
});
