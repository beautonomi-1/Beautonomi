import { describe, expect, it } from "vitest";
import { acceptBrandBrief } from "../accept-brief";

describe("acceptBrandBrief", () => {
  it("rejects already accepted briefs", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { status: "accepted", accepted_campaign_id: "c1", name: "X" },
                  error: null,
                }),
            }),
          }),
        }),
      }),
    };

    await expect(
      acceptBrandBrief(supabase as never, {
        tenantId: "t1",
        briefId: "b1",
        actorId: "u1",
        tenantSlug: "za",
      }),
    ).rejects.toThrow(/already accepted/i);
  });
});
