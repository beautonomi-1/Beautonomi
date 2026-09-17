import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveCopilotQuestion } from "../resolve-copilot-intent";
import type { CopilotInput } from "../copilot-types";

vi.mock("@/lib/admin/global-search", () => ({
  runAdminGlobalSearch: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}));

vi.mock("@/lib/agents/copilot/canonicalize-entity", () => ({
  canonicalizeEntityRef: vi.fn(async (_t: string, type: string, id: string) => ({
    entityId: id.length === 36 ? id : "11111111-1111-4111-8111-111111111111",
    label: type === "provider" ? "Glow Spa" : undefined,
  })),
  isUuid: (v: string) => /^[0-9a-f-]{36}$/i.test(v),
}));

import { runAdminGlobalSearch } from "@/lib/admin/global-search";

const baseInput = (overrides: Partial<CopilotInput> = {}): CopilotInput => ({
  question: "How is this provider doing?",
  tenantId: "22222222-2222-4222-8222-222222222222",
  adminRole: "superadmin",
  adminUserId: "33333333-3333-4333-8333-333333333333",
  allowedSections: ["providers_operations", "overview", "finance", "users_trust"],
  ...overrides,
});

describe("resolveCopilotQuestion", () => {
  beforeEach(() => {
    vi.mocked(runAdminGlobalSearch).mockReset();
  });

  it("uses pageContext provider without search", async () => {
    const result = await resolveCopilotQuestion(
      baseInput({
        pageContext: {
          entityType: "provider",
          entityId: "11111111-1111-4111-8111-111111111111",
          label: "Glow Spa",
        },
      }),
    );
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.intent).toBe("provider.health");
      expect(result.resolvedEntities.provider?.entityId).toBeTruthy();
    }
    expect(runAdminGlobalSearch).not.toHaveBeenCalled();
  });

  it("returns disambiguation for multiple search hits", async () => {
    vi.mocked(runAdminGlobalSearch).mockResolvedValue({
      users: [],
      providers: [
        { id: "a", business_name: "Glow A", owner_name: null, owner_email: null, phone: null, status: "active" },
        { id: "b", business_name: "Glow B", owner_name: null, owner_email: null, phone: null, status: "active" },
      ],
      bookings: [],
    });
    const result = await resolveCopilotQuestion(
      baseInput({
        question: "How is Glow Spa doing?",
        pageContext: undefined,
      }),
    );
    expect(result.status).toBe("disambiguation");
    if (result.status === "disambiguation") {
      expect(result.options.length).toBe(2);
    }
  });

  it("maps customer spend intent on user page", async () => {
    const result = await resolveCopilotQuestion(
      baseInput({
        question: "How much have they spent?",
        pageContext: {
          entityType: "user",
          entityId: "44444444-4444-4444-8444-444444444444",
        },
      }),
    );
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.intent).toBe("user.spend");
    }
  });
});
