import { describe, expect, it, vi, beforeEach } from "vitest";
import { searchKnowledgeForCopilot } from "../copilot-reads";
import type { AgentPrincipal } from "@beautonomi/agent-policy";

const principal = {
  tenantId: "22222222-2222-4222-8222-222222222222",
} as AgentPrincipal;

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { getSupabaseAdmin } from "@/lib/supabase/admin";

describe("searchKnowledgeForCopilot", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseAdmin).mockReset();
  });

  it("maps RPC rows to slug, summary, and adminPath", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          title: "Brand Desk Runbook",
          slug: "brand-desk-runbook",
          summary: "Briefs and board.",
          is_internal: true,
        },
      ],
      error: null,
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc } as never);

    const out = await searchKnowledgeForCopilot(principal, { query: "brand brief" });

    expect(rpc).toHaveBeenCalledWith("search_learning_articles_admin", {
      p_query: "brand brief",
      p_limit: 5,
      p_offset: 0,
      p_audience: null,
      p_include_internal: true,
    });
    expect(out.results[0]).toEqual({
      title: "Brand Desk Runbook",
      slug: "brand-desk-runbook",
      summary: "Briefs and board.",
      adminPath: "/admin/knowledge-base/brand-desk-runbook",
      is_internal: true,
    });
  });
});
