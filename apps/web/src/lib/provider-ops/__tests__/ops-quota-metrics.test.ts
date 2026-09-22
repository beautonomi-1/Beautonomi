import { describe, expect, it, vi } from "vitest";
import { countOpsQuotaActual } from "@/lib/provider-ops/ops-quota-metrics";

describe("countOpsQuotaActual", () => {
  it("counts at_risk_saves by retention_owner and at_risk_saved_at", async () => {
    const gte = vi.fn().mockResolvedValue({ count: 3, error: null });
    const eqOwner = vi.fn().mockReturnValue({ gte });
    const eqTenant = vi.fn().mockReturnValue({ eq: eqOwner });
    const select = vi.fn().mockReturnValue({ eq: eqTenant });

    const supabase = {
      from: vi.fn().mockReturnValue({ select }),
    };

    const periodStart = new Date("2026-03-01T00:00:00.000Z");
    const actual = await countOpsQuotaActual(supabase as never, {
      tenantId: "tenant-1",
      userId: "user-ret",
      desk: "retention",
      metric: "at_risk_saves",
      periodStart,
    });

    expect(actual).toBe(3);
    expect(supabase.from).toHaveBeenCalledWith("provider_ops_cases");
    expect(eqOwner).toHaveBeenCalledWith("retention_owner_id", "user-ret");
    expect(gte).toHaveBeenCalledWith("at_risk_saved_at", periodStart.toISOString());
  });

  it("returns 0 for unknown metrics", async () => {
    const supabase = { from: vi.fn() };
    const actual = await countOpsQuotaActual(supabase as never, {
      tenantId: "t",
      userId: "u",
      desk: "sales",
      metric: "unknown_metric",
      periodStart: new Date(),
    });
    expect(actual).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
