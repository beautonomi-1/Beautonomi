import { beforeEach, describe, expect, it, vi } from "vitest";
import { countSupportTicketsForNav } from "../support-ticket-nav-count";

function makeCountChain(count: number, error: { code?: string } | null = null) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    not: () => chain,
    lt: () => chain,
    then: (resolve: (v: unknown) => void) => resolve({ count, error }),
  };
  return chain;
}

describe("countSupportTicketsForNav", () => {
  let awaitingCounts: number[];
  let slaCount: number;
  let awaitingErrors: Array<{ code?: string } | null>;

  beforeEach(() => {
    awaitingCounts = [7];
    slaCount = 2;
    awaitingErrors = [null];
  });

  function makeSupabase() {
    let awaitingCall = 0;
    return {
      from: (table: string) => {
        if (table !== "support_tickets") throw new Error(`unexpected table ${table}`);
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            const isHead = opts?.head === true;
            return {
              eq: (col: string, val: unknown) => {
                if (col === "needs_agent_response" && val === true) {
                  const idx = awaitingCall++;
                  return makeCountChain(awaitingCounts[idx] ?? 0, awaitingErrors[idx] ?? null);
                }
                if (col === "status" && val === "open") {
                  return makeCountChain(awaitingCounts[awaitingCall] ?? 0, null);
                }
                if (isHead && col === "status") {
                  return {
                    not: () => ({
                      lt: () => makeCountChain(slaCount, null),
                    }),
                  };
                }
                return makeCountChain(0, null);
              },
              lt: () => ({
                not: () => makeCountChain(slaCount, null),
              }),
            };
          },
        };
      },
    };
  }

  it("returns global awaiting count for admin_support", async () => {
    const supabase = makeSupabase() as never;
    const result = await countSupportTicketsForNav(supabase, {
      role: "admin_support",
      tenantProviderIds: [],
    });
    expect(result).toEqual({ awaiting_response: 7, sla_breached: 2 });
  });

  it("falls back to open tickets when needs_agent_response column is missing", async () => {
    awaitingCounts = [0, 5];
    awaitingErrors = [{ code: "42703" }, null];
    const supabase = makeSupabase() as never;
    const result = await countSupportTicketsForNav(supabase, {
      role: "support_agent",
      tenantProviderIds: [],
    });
    expect(result.awaiting_response).toBe(5);
  });

  it("scopes to tenant providers for non-support global roles", async () => {
    const inSpy = vi.fn().mockReturnValue(makeCountChain(3, null));
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: inSpy,
          }),
          lt: () => ({
            not: () => ({
              in: inSpy,
            }),
          }),
        }),
      }),
    } as never;

    await countSupportTicketsForNav(supabase, {
      role: "finance_admin",
      tenantProviderIds: ["prov-1", "prov-2"],
    });

    expect(inSpy).toHaveBeenCalledWith("provider_id", ["prov-1", "prov-2"]);
  });

  it("returns zero when tenant-scoped role has no providers", async () => {
    const supabase = makeSupabase() as never;
    const result = await countSupportTicketsForNav(supabase, {
      role: "finance_admin",
      tenantProviderIds: [],
    });
    expect(result).toEqual({ awaiting_response: 0, sla_breached: 0 });
  });
});
