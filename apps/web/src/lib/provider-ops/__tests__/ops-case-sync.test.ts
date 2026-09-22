import { describe, expect, it, vi } from "vitest";
import { syncCaseMilestonesForLeadStage } from "@/lib/provider-ops/ops-case";

describe("syncCaseMilestonesForLeadStage", () => {
  it("sets first_contacted_at when stage becomes contacted", async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "provider_ops_cases") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "case-1", first_contacted_at: null, won_at: null },
              }),
            }),
            update,
          };
        }
        throw new Error(table);
      }),
    };

    await syncCaseMilestonesForLeadStage(supabase as never, "tenant-1", "lead-1", "contacted");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ first_contacted_at: expect.any(String) }),
    );
  });
});
