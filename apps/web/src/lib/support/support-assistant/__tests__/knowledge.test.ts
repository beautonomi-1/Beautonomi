import { describe, expect, it, vi } from "vitest";
import { searchPublicKnowledgeForAssistant, SUPPORT_CANCELLATION_WALLET_FACTS } from "../knowledge";

describe("searchPublicKnowledgeForAssistant", () => {
  it("never returns internal audience articles", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [
          { title: "Public", slug: "public", audience: "customer" },
          { title: "Internal", slug: "secret", audience: "internal" },
        ],
        error: null,
      }),
    };
    const hits = await searchPublicKnowledgeForAssistant(supabase as never, "refund", "customer");
    expect(hits.some((h) => h.slug === "secret")).toBe(false);
    expect(hits.some((h) => h.slug === "public")).toBe(true);
  });

  it("states fees are online-only and bank refunds are finance-approved", () => {
    const blob = SUPPORT_CANCELLATION_WALLET_FACTS.join(" ");
    expect(blob).toMatch(/Pay-at-venue|card-machine/i);
    expect(blob).toMatch(/wallet first/i);
    expect(blob).toMatch(/finance/i);
    expect(blob).not.toMatch(/AirCover|BCover|insured/i);
  });
});
