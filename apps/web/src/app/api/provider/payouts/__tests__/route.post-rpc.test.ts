import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

/**
 * §payout-hardening 2026-06: POST /api/provider/payouts now creates the payout
 * through the advisory-locked `insert_payout_request_guarded` RPC (migration 671)
 * instead of a raw insert + post-insert re-check/delete. These tests cover:
 *  - the RPC is invoked with the per-provider max-available-before-reserve so the
 *    DB can serialize concurrent requests, and the returned row is surfaced;
 *  - an RPC INSUFFICIENT_BALANCE rejection (concurrent reserve raced us) maps to
 *    a clean 400 INSUFFICIENT_BALANCE response, not a 500.
 */

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/api-helpers")>(
    "@/lib/supabase/api-helpers",
  );
  return {
    ...actual,
    requireRoleInApi: vi.fn(),
    getProviderIdForUser: vi.fn(),
  };
});

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/provider/available-payout-balance", () => ({
  getAvailablePayoutBalance: vi.fn(),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(),
}));

vi.mock("@/lib/tenant/scoped-overrides", () => ({
  fetchScopedSingle: vi.fn(),
}));

vi.mock("@/lib/rate-limit/payout-request", () => ({
  checkPayoutRequestRateLimit: vi.fn(),
}));

vi.mock("@/lib/integrations/slack/finance-triggers", () => ({
  slackNotifyPayoutRequested: vi.fn(),
}));

vi.mock("@/lib/reports/provider-report-utils", () => ({
  getProviderReportContext: vi.fn(),
}));

const owner = MOCK_USERS.provider_owner;
const PROVIDER_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const ACCOUNT_ID = "33333333-3333-3333-3333-333333333333";

function buildServerMock() {
  return {
    from: vi.fn((table: string) => {
      const builder: any = {};
      const chain = () => builder;
      builder.select = vi.fn(chain);
      builder.eq = vi.fn(chain);
      builder.is = vi.fn(chain);
      builder.order = vi.fn(chain);
      if (table === "providers") {
        builder.maybeSingle = vi.fn().mockResolvedValue({
          data: {
            tenant_id: TENANT_ID,
            currency: "ZAR",
            timezone: "Africa/Johannesburg",
            business_name: "Test Salon",
          },
          error: null,
        });
      }
      builder.then = (resolve: (v: any) => void) => {
        if (table === "provider_payout_accounts") {
          return resolve({
            data: [
              {
                id: ACCOUNT_ID,
                recipient_code: "RCP_1",
                account_name: "Test",
                account_number_last4: "1234",
                bank_name: "Test Bank",
                currency: "ZAR",
              },
            ],
            error: null,
          });
        }
        return resolve({ data: [], error: null });
      };
      return builder;
    }),
  };
}

function buildAdminMock(rpcResult: { data: any; error: any }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return {
    rpc,
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  };
}

async function setupMocks(adminMock: ReturnType<typeof buildAdminMock>) {
  const { requirePermission } = await import("@/lib/auth/requirePermission");
  const { getProviderIdForUser } = await import("@/lib/supabase/api-helpers");
  const { getSupabaseServer } = await import("@/lib/supabase/server");
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const { getAvailablePayoutBalance } = await import("@/lib/provider/available-payout-balance");
  const { resolveTenantIdWithZaFallback } = await import("@/lib/tenant/resolve-tenant-from-db");
  const { getTenantRegionConfig } = await import("@/lib/regions/config");
  const { fetchScopedSingle } = await import("@/lib/tenant/scoped-overrides");
  const { checkPayoutRequestRateLimit } = await import("@/lib/rate-limit/payout-request");
  const { getProviderReportContext } = await import("@/lib/reports/provider-report-utils");

  vi.mocked(requirePermission).mockResolvedValue({
    authorized: true,
    user: { id: owner.id, role: owner.role },
  });
  vi.mocked(getProviderIdForUser).mockResolvedValue(PROVIDER_ID);
  vi.mocked(getSupabaseServer).mockResolvedValue(buildServerMock() as never);
  vi.mocked(getSupabaseAdmin).mockReturnValue(adminMock as never);
  vi.mocked(resolveTenantIdWithZaFallback).mockResolvedValue(TENANT_ID);
  vi.mocked(getTenantRegionConfig).mockResolvedValue({ defaultCurrency: "ZAR" } as never);
  vi.mocked(fetchScopedSingle).mockResolvedValue({
    data: { settings: { payouts: { minimum_payout_amount: 100, payout_hold_days: 0 } } },
    error: null,
  } as never);
  vi.mocked(checkPayoutRequestRateLimit).mockResolvedValue({ allowed: true } as never);
  vi.mocked(getProviderReportContext).mockResolvedValue({ timezone: "Africa/Johannesburg" } as never);
  // available 500, pending reserve 200 → max available before reserve = 700
  vi.mocked(getAvailablePayoutBalance).mockResolvedValue({
    availableBalance: 500,
    pendingPayoutsSum: 200,
    rawBalance: 500,
    hasNegativeBalance: false,
    breakdown: {
      recognizedPayoutableEarnings: 1000,
      onHold: 0,
      excludedProviderCollected: 0,
      completedPayouts: 300,
      pendingPayouts: 200,
      availableBalance: 500,
    },
  });
}

describe("POST /api/provider/payouts (guarded RPC path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the payout via insert_payout_request_guarded with the pre-reserve ceiling", async () => {
    const payoutRow = {
      id: "payout-1",
      provider_id: PROVIDER_ID,
      amount: 400,
      net_amount: 400,
      status: "pending",
      created_at: "2026-06-11T00:00:00.000Z",
    };
    const adminMock = buildAdminMock({ data: [payoutRow], error: null });
    await setupMocks(adminMock);

    const { POST } = await import("../route");
    const response = await POST(
      createMockNextRequest({
        method: "POST",
        url: "http://localhost:3000/api/provider/payouts",
        body: { amount: 400 },
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(adminMock.rpc).toHaveBeenCalledTimes(1);
    const [fnName, args] = adminMock.rpc.mock.calls[0];
    expect(fnName).toBe("insert_payout_request_guarded");
    expect(args.p_provider_id).toBe(PROVIDER_ID);
    // availableBalance (500) + pending reserve (200) = the earnings-side ceiling
    expect(args.p_max_available_before_reserve).toBe(700);
    expect(args.p_payout).toMatchObject({
      amount: 400,
      net_amount: 400,
      status: "pending",
      currency: "ZAR",
      payout_method: "bank_transfer",
    });

    const body = await response.json();
    expect(body.data.id).toBe("payout-1");
    expect(body.data.requested_at).toBe(payoutRow.created_at);
  });

  it("maps an RPC INSUFFICIENT_BALANCE rejection to a 400 with that code", async () => {
    const adminMock = buildAdminMock({
      data: null,
      error: { message: "INSUFFICIENT_BALANCE", code: "23514" },
    });
    await setupMocks(adminMock);

    const { POST } = await import("../route");
    const response = await POST(
      createMockNextRequest({
        method: "POST",
        url: "http://localhost:3000/api/provider/payouts",
        body: { amount: 400 },
      }) as never,
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INSUFFICIENT_BALANCE");
  });
});
