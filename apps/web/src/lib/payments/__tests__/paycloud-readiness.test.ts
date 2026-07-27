import { describe, expect, it, vi, beforeEach } from "vitest";
import { computePaycloudReadiness } from "../paycloud-readiness";

function terminalChain(data: Record<string, unknown>[]) {
  const chain: Record<string, unknown> & PromiseLike<{ data: typeof data }> = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    neq: vi.fn(),
    then(onFulfilled, onRejected) {
      return Promise.resolve({ data }).then(onFulfilled, onRejected);
    },
  };
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.neq = vi.fn(() => chain);
  return chain;
}

function makeSupabase(terminals: Record<string, unknown>[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === "providers") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { accept_paycloud: true, tenant_id: "t1" } }),
        };
      }
      if (table === "paycloud_terminals") {
        return terminalChain(terminals);
      }
      if (table === "provider_paycloud_settings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        };
      }
      if (table === "feature_flags") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [{ enabled: true, tenant_id: null }] }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as never;
}

vi.mock("@/lib/subscriptions/feature-access", () => ({
  checkPaycloudFeatureAccess: vi.fn(async () => ({ enabled: true, maxTerminals: 5 })),
}));

describe("computePaycloudReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not block when inactive terminal lacks merchant but active terminal is usable", async () => {
    const supabase = makeSupabase([
      { id: "1", status: "active", is_active: true, in_flight_payment_id: null, paycloud_merchant_id: "m1", location_id: "loc", merchant: { environment: "sandbox" } },
      { id: "2", status: "active", is_active: false, in_flight_payment_id: null, paycloud_merchant_id: null, location_id: null },
    ]);
    const result = await computePaycloudReadiness(supabase, "provider-1");
    expect(result.terminals.withoutMerchant).toBe(0);
    expect(result.terminals.active).toBeGreaterThan(0);
    expect(result.blockers.some((b) => b.code === "NO_MERCHANT")).toBe(false);
  });
});
