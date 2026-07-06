import { describe, expect, it, vi, beforeEach } from "vitest";

const computeGatewayFeeSuggestions = vi.fn();

vi.mock("@/lib/admin/fee-reconciliation-compute", () => ({
  computeGatewayFeeSuggestions: (...args: unknown[]) => computeGatewayFeeSuggestions(...args),
  feeReconciliationDateBounds: (start: string, end: string) => ({
    startIso: `${start}T00:00:00.000Z`,
    endIso: `${end}T23:59:59.999Z`,
  }),
  normalizeGatewayName: (g: string) => g.trim().toLowerCase(),
}));

import {
  runAutoFeeReconciliationForDay,
  runAutoFeeReconciliation,
} from "@/lib/admin/auto-fee-reconciliation";

describe("auto-fee-reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts auto_daily row with actual = recorded ledger fees", async () => {
    computeGatewayFeeSuggestions.mockResolvedValue({
      recorded_fees: 12.69,
      expected_fees_from_config: 11.5,
      charge_count: 2,
      payout_transfer_count: 0,
    });

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ upsert }),
    } as unknown as Parameters<typeof runAutoFeeReconciliationForDay>[0];

    const result = await runAutoFeeReconciliationForDay(
      supabase,
      "2026-07-03",
      "tenant-1",
      "paystack",
    );

    expect(computeGatewayFeeSuggestions).toHaveBeenCalledWith(
      supabase,
      "paystack",
      "2026-07-03",
      "2026-07-03",
      { tenantId: "tenant-1", asOfDate: "2026-07-03" },
    );
    expect(result.upserted).toBe(true);
    expect(result.actual_fees).toBe(12.69);
    expect(result.expected_fees).toBe(11.5);
    expect(result.variance).toBeCloseTo(1.19, 2);
    expect(result.status).toBe("pending");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "auto_daily",
        actual_fees: 12.69,
        recorded_fees: 12.69,
        tenant_id: "tenant-1",
      }),
      { onConflict: "reconciliation_date,gateway_name,tenant_id" },
    );
  });

  it("marks reviewed when variance is below threshold", async () => {
    computeGatewayFeeSuggestions.mockResolvedValue({
      recorded_fees: 10,
      expected_fees_from_config: 10.5,
      charge_count: 1,
      payout_transfer_count: 0,
    });

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ upsert }),
    } as unknown as Parameters<typeof runAutoFeeReconciliationForDay>[0];

    const result = await runAutoFeeReconciliationForDay(
      supabase,
      "2026-07-03",
      "tenant-1",
      "paystack",
      1,
    );

    expect(result.status).toBe("reviewed");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "reviewed" }),
      expect.any(Object),
    );
  });

  it("iterates tenants × gateways × dates in backfill mode", async () => {
    computeGatewayFeeSuggestions.mockResolvedValue({
      recorded_fees: 5.5,
      expected_fees_from_config: 5.5,
      charge_count: 1,
      payout_transfer_count: 0,
    });

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ upsert }),
    } as unknown as Parameters<typeof runAutoFeeReconciliation>[0];

    const summary = await runAutoFeeReconciliation(supabase, {
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      tenantIds: ["t1"],
      gateways: ["paystack"],
    });

    expect(summary.results).toHaveLength(2);
    expect(summary.upserted).toBe(2);
  });

  it("skips upsert for days with no gateway activity", async () => {
    computeGatewayFeeSuggestions.mockResolvedValue({
      recorded_fees: 0,
      expected_fees_from_config: 0,
      charge_count: 0,
      payout_transfer_count: 0,
    });

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ upsert }),
    } as unknown as Parameters<typeof runAutoFeeReconciliation>[0];

    const summary = await runAutoFeeReconciliation(supabase, {
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      tenantIds: ["t1"],
      gateways: ["paystack"],
    });

    expect(summary.results).toHaveLength(2);
    expect(summary.upserted).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});
