import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAtRiskSaveForCase } from "@/lib/provider-ops/ops-case";

const trendMock = vi.fn();

vi.mock("@/lib/provider-ops/provider-booking-trend", () => ({
  getProviderCompletedBookingTrend: (...args: unknown[]) => trendMock(...args),
}));

describe("recordAtRiskSaveForCase", () => {
  beforeEach(() => {
    trendMock.mockReset();
    trendMock.mockResolvedValue({
      previous30d: 10,
      recent30d: 4,
      concerning: true,
    });
  });

  it("returns idempotent result when already saved", async () => {
    const update = vi.fn();
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "case-1",
                  tenant_id: "t1",
                  provider_id: "p1",
                  status: "activated",
                  current_desk: "retention",
                  at_risk_saved_at: "2026-01-01T00:00:00Z",
                  retention_owner_id: "u1",
                },
                error: null,
              }),
            }),
          }),
        }),
        update,
      }),
    };

    const result = await recordAtRiskSaveForCase(supabase as never, {
      tenantId: "t1",
      caseId: "case-1",
      actorUserId: "u1",
    });

    expect(result).toMatchObject({
      ok: true,
      atRiskSavedAt: "2026-01-01T00:00:00Z",
      alreadyRecorded: true,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("stamps at_risk_saved_at when trend is concerning", async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "case-1",
                  tenant_id: "t1",
                  provider_id: "p1",
                  status: "activated",
                  current_desk: "retention",
                  at_risk_saved_at: null,
                  retention_owner_id: null,
                },
                error: null,
              }),
            }),
          }),
        }),
        update,
      }),
    };

    const result = await recordAtRiskSaveForCase(supabase as never, {
      tenantId: "t1",
      caseId: "case-1",
      actorUserId: "rep-1",
    });

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        at_risk_saved_at: expect.any(String),
        retention_owner_id: "rep-1",
      }),
    );
  });
});
