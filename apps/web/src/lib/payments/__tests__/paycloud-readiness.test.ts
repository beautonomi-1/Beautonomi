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
      if (table === "provider_paycloud_payments") {
        const chain: Record<string, unknown> & PromiseLike<{ data: [] }> = {
          select: vi.fn(),
          eq: vi.fn(),
          in: vi.fn(),
          then(onFulfilled, onRejected) {
            return Promise.resolve({ data: [] }).then(onFulfilled, onRejected);
          },
        };
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.in = vi.fn(() => chain);
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as never;
}

vi.mock("@/lib/subscriptions/feature-access", () => ({
  checkPaycloudFeatureAccess: vi.fn(async () => ({ enabled: true, maxTerminals: 5 })),
}));

vi.mock("@/lib/server/feature-flags", () => ({
  isFeatureEnabledServer: vi.fn(async () => true),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

vi.mock("@/lib/payments/resolve-paycloud-app-credentials", () => ({
  resolvePaycloudAppCredentialsDetailed: vi.fn(async () => ({
    ok: true,
    credentials: { app_id: "a", app_rsa_private_key: "k", gateway_rsa_public_key: "pk" },
    appEnvironment: "sandbox",
  })),
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

  it("does not add FLAG_OFF when platform flag is enabled via service role", async () => {
    const supabase = makeSupabase([
      {
        id: "1",
        status: "active",
        is_active: true,
        in_flight_payment_id: null,
        paycloud_merchant_id: "m1",
        location_id: "loc",
        merchant: { environment: "sandbox" },
      },
    ]);
    const result = await computePaycloudReadiness(supabase, "provider-1");
    expect(result.blockers.some((b) => b.code === "FLAG_OFF")).toBe(false);
    expect(result.ready).toBe(true);
  });

  it("adds FLAG_OFF when isFeatureEnabledServer returns false", async () => {
    const { isFeatureEnabledServer } = await import("@/lib/server/feature-flags");
    vi.mocked(isFeatureEnabledServer).mockResolvedValueOnce(false);
    const supabase = makeSupabase([
      {
        id: "1",
        status: "active",
        is_active: true,
        in_flight_payment_id: null,
        paycloud_merchant_id: "m1",
        location_id: "loc",
      },
    ]);
    const result = await computePaycloudReadiness(supabase, "provider-1");
    expect(result.blockers.some((b) => b.code === "FLAG_OFF")).toBe(true);
    expect(result.ready).toBe(false);
  });

  it("emits NO_CREDENTIALS when no enabled app row exists", async () => {
    const { resolvePaycloudAppCredentialsDetailed } = await import(
      "@/lib/payments/resolve-paycloud-app-credentials"
    );
    vi.mocked(resolvePaycloudAppCredentialsDetailed).mockResolvedValueOnce({
      ok: false,
      reason: "PLATFORM_CREDENTIALS_MISSING",
    });
    const supabase = makeSupabase([
      {
        id: "1",
        status: "active",
        is_active: true,
        in_flight_payment_id: null,
        paycloud_merchant_id: "m1",
        location_id: "loc",
        merchant: { environment: "live", is_active: true, tenant_id: "t1" },
      },
    ]);
    const result = await computePaycloudReadiness(supabase, "provider-1");
    expect(result.blockers.some((b) => b.code === "NO_CREDENTIALS")).toBe(true);
    expect(result.ready).toBe(false);
  });
});
