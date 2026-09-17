import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveCopilotQuestion } from "../resolve-copilot-intent";
import type { CopilotInput } from "../copilot-types";
import { isMetaOrHelpQuestion, isWeakSearchPhrase } from "../copilot-capabilities";

vi.mock("@/lib/admin/global-search", () => ({
  runAdminGlobalSearch: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}));

vi.mock("@/lib/agents/copilot/canonicalize-entity", () => ({
  canonicalizeEntityRef: vi.fn(async (_t: string, _type: string, id: string) => ({
    entityId: id,
  })),
  isUuid: (v: string) => /^[0-9a-f-]{36}$/i.test(v),
}));

import { runAdminGlobalSearch } from "@/lib/admin/global-search";

const baseInput = (overrides: Partial<CopilotInput> = {}): CopilotInput => ({
  question: "How is this provider doing?",
  tenantId: "22222222-2222-4222-8222-222222222222",
  adminRole: "superadmin",
  adminUserId: "33333333-3333-4333-8333-333333333333",
  allowedSections: ["providers_operations", "overview"],
  ...overrides,
});

describe("copilot-capabilities", () => {
  it("detects meta/help questions", () => {
    expect(isMetaOrHelpQuestion("what do you have access to")).toBe(true);
    expect(isWeakSearchPhrase("access")).toBe(true);
  });
});

describe("resolveCopilotQuestion help path", () => {
  beforeEach(() => {
    vi.mocked(runAdminGlobalSearch).mockReset();
  });

  it("returns help without searching for access meta question", async () => {
    const result = await resolveCopilotQuestion(
      baseInput({ question: "what do you have access to", pageContext: undefined }),
    );
    expect(result.status).toBe("help");
    expect(runAdminGlobalSearch).not.toHaveBeenCalled();
  });

  it("searches when email hard signal present", async () => {
    vi.mocked(runAdminGlobalSearch).mockResolvedValue({
      users: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          email: "pat@example.com",
          phone: null,
          full_name: "Pat",
          role: "customer",
        },
      ],
      providers: [],
      bookings: [],
    });
    const result = await resolveCopilotQuestion(
      baseInput({ question: "What is pat@example.com booking history?", pageContext: undefined }),
    );
    expect(runAdminGlobalSearch).toHaveBeenCalled();
    expect(result.status).toBe("ready");
  });

  it("clarifies weak leftover phrase instead of not_found access", async () => {
    vi.mocked(runAdminGlobalSearch).mockResolvedValue({ users: [], providers: [], bookings: [] });
    const result = await resolveCopilotQuestion(
      baseInput({ question: "tell me about access", pageContext: undefined }),
    );
    expect(result.status).not.toBe("not_found");
    if (result.status === "clarify") {
      expect(result.message).not.toContain('matching "access"');
    }
    expect(runAdminGlobalSearch).not.toHaveBeenCalled();
  });
});
