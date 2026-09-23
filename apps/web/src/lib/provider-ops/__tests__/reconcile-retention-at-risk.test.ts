import { describe, expect, it, vi, beforeEach } from "vitest";
import { reconcileRetentionAtRisk } from "@/lib/provider-ops/reconcile-retention-at-risk";

vi.mock("@/lib/provider-ops/provider-booking-trend", () => ({
  getProviderCompletedBookingTrend: vi.fn(),
}));

import { getProviderCompletedBookingTrend } from "@/lib/provider-ops/provider-booking-trend";

const trendMock = vi.mocked(getProviderCompletedBookingTrend);

function makeSupabase(cases: Record<string, unknown>[]) {
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  return {
    updates,
    client: {
      from(table: string) {
        if (table === "provider_ops_cases") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    not: () => ({
                      limit: async () => ({ data: cases }),
                    }),
                  }),
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              eq: async (_col: string, id: string) => {
                updates.push({ id, payload });
                return { error: null };
              },
            }),
          };
        }
        if (table === "provider_ops_case_touches") {
          return {
            select: () => ({
              eq: () => ({
                gt: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: null }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
}

describe("reconcileRetentionAtRisk", () => {
  beforeEach(() => {
    trendMock.mockReset();
  });

  it("re-flags after save when volume is concerning and cooldown elapsed", async () => {
    const savedAt = new Date(Date.now() - 31 * 86400000).toISOString();
    const flaggedAt = new Date(Date.now() - 60 * 86400000).toISOString();
    const { client, updates } = makeSupabase([
      {
        id: "case-1",
        provider_id: "prov-1",
        at_risk_flagged_at: flaggedAt,
        at_risk_saved_at: savedAt,
        last_qualifying_booking_at: new Date().toISOString(),
        qualifying_booking_count: 5,
      },
    ]);
    trendMock.mockResolvedValue({
      previous30d: 10,
      recent30d: 3,
      concerning: true,
    });

    const result = await reconcileRetentionAtRisk(client as never, "tenant-1");

    expect(result.flagged).toBe(1);
    expect(updates[0]?.payload.at_risk_saved_at).toBeNull();
    expect(updates[0]?.payload.at_risk_flagged_at).toBeTruthy();
  });

  it("does not re-flag inside save cooldown", async () => {
    const savedAt = new Date(Date.now() - 5 * 86400000).toISOString();
    const { client, updates } = makeSupabase([
      {
        id: "case-2",
        provider_id: "prov-2",
        at_risk_flagged_at: null,
        at_risk_saved_at: savedAt,
        last_qualifying_booking_at: new Date().toISOString(),
        qualifying_booking_count: 5,
      },
    ]);
    trendMock.mockResolvedValue({
      previous30d: 10,
      recent30d: 2,
      concerning: true,
    });

    const result = await reconcileRetentionAtRisk(client as never, "tenant-1");

    expect(result.flagged).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
