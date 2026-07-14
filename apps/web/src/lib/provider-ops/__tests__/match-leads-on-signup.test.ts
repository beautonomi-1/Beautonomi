import { describe, expect, it, vi } from "vitest";
import { consolidateLeadsOnSignup } from "@/lib/provider-ops/match-leads-on-signup";

function createMockSupabase(responses: Record<string, unknown>) {
  const inserts: unknown[] = [];
  const updates: { table: string; data: unknown; id: string }[] = [];

  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    const builder = () => chain;
    chain.select = builder;
    chain.eq = builder;
    chain.is = builder;
    chain.or = builder;
    chain.order = builder;
    chain.update = vi.fn((data: unknown) => {
      updates.push({ table, data, id: "pending" });
      return { eq: builder };
    });
    chain.insert = vi.fn((data: unknown) => {
      inserts.push({ table, data });
      return Promise.resolve({ error: null });
    });

    const terminal = () => {
      const key = `${table}:result`;
      return Promise.resolve(responses[key] ?? { data: [], error: null });
    };
    chain.maybeSingle = terminal;
    chain.single = terminal;
    chain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve(responses[`${table}:result`] ?? { data: [], error: null }).then(resolve);

    Object.assign(chain, {
      [Symbol.toStringTag]: "Thenable",
    });

    return chain;
  });

  return {
    from,
    inserts,
    updates,
  };
}

describe("consolidateLeadsOnSignup", () => {
  it("returns null when no candidates", async () => {
    const supabase = createMockSupabase({});
    const result = await consolidateLeadsOnSignup({
      supabase: supabase as never,
      tenantId: "t1",
      providerId: "p1",
      userId: "u1",
      email: "a@b.com",
    });
    expect(result.primaryLeadId).toBeNull();
  });

  it("ranks invite token above email match", async () => {
    const tokenLead = { id: "lead-token", created_at: "2026-01-02" };
    const emailLead = { id: "lead-email", email: "a@b.com", created_at: "2026-01-01" };

    let providerLeadsCall = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== "provider_leads") {
          const chain: Record<string, unknown> = {};
          const b = () => chain;
          chain.select = b;
          chain.eq = b;
          chain.update = vi.fn(() => ({ eq: b }));
          chain.insert = vi.fn(() => Promise.resolve({ error: null }));
          return chain;
        }
        providerLeadsCall += 1;
        const chain: Record<string, unknown> = {};
        const b = () => chain;
        chain.select = b;
        chain.eq = b;
        chain.is = b;
        chain.or = b;
        chain.order = b;
        chain.update = vi.fn(() => ({ eq: b }));
        chain.insert = vi.fn(() => Promise.resolve({ error: null }));
        if (providerLeadsCall === 1) {
          chain.then = (resolve: (v: unknown) => void) =>
            Promise.resolve({ data: [tokenLead], error: null }).then(resolve);
        } else {
          chain.then = (resolve: (v: unknown) => void) =>
            Promise.resolve({ data: [emailLead], error: null }).then(resolve);
        }
        return chain;
      }),
    };

    const result = await consolidateLeadsOnSignup({
      supabase: supabase as never,
      tenantId: "t1",
      providerId: "p1",
      userId: "u1",
      inviteToken: "tok",
      email: "a@b.com",
    });

    expect(result.primaryLeadId).toBe("lead-token");
    expect(result.consolidatedLeadIds).toContain("lead-email");
  });
});
