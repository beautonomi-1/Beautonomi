import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

/**
 * §payout-account-fix 2026-05: focused tests covering the cases that were
 * silently failing in production:
 *  - Successful save with the admin DB write path after provider+tenant auth.
 *  - Paystack `bank/resolve` failure surfaces as a 400 with the Paystack
 *    message rather than a generic 500.
 *  - DB insert failure rolls back the Paystack transfer recipient so we don't
 *    leak orphan recipients.
 */

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/supabase/api-helpers")
  >("@/lib/supabase/api-helpers");
  return {
    ...actual,
    requireRoleInApi: vi.fn(),
    getProviderIdForUser: vi.fn(),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(),
}));

vi.mock("@/lib/bookings/resolve-payment-tenant", () => ({
  resourceTenantMatchesHostTenant: vi.fn(),
}));

vi.mock("@/lib/payments/paystack-complete", () => ({
  verifyAccount: vi.fn(),
  createTransferRecipient: vi.fn(),
  deleteTransferRecipient: vi.fn(),
}));

const owner = MOCK_USERS.provider_owner;
const PROVIDER_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";

type TableResult = { data: any; error: any; count?: number | null };

interface TableHandler {
  /** Result returned by `.single()` / `.maybeSingle()` and terminal awaits. */
  select?: TableResult;
  /** Result returned by `.insert(...).select().single()`. */
  insert?: TableResult;
  /** Result returned by `.update(...)` calls. */
  update?: TableResult;
}

function buildAdminMock(handlers: Record<string, TableHandler>) {
  return {
    from: vi.fn((table: string) => {
      const handler = handlers[table] ?? {};
      const builder: any = {};
      const chain = () => builder;
      builder.select = vi.fn(chain);
      builder.eq = vi.fn(chain);
      builder.neq = vi.fn(chain);
      builder.is = vi.fn(chain);
      builder.order = vi.fn(chain);
      builder.limit = vi.fn(chain);
      builder.insert = vi.fn(() => {
        const insertChain: any = {
          select: vi.fn(() => insertChain),
          single: vi.fn().mockResolvedValue(handler.insert ?? { data: null, error: null }),
        };
        return insertChain;
      });
      builder.update = vi.fn(() => {
        const updateChain: any = {
          eq: vi.fn(() => updateChain),
          neq: vi.fn(() => updateChain),
          select: vi.fn(() => updateChain),
          single: vi.fn().mockResolvedValue(handler.update ?? { data: null, error: null }),
          then: (resolve: (v: any) => void) =>
            resolve(handler.update ?? { data: null, error: null }),
        };
        return updateChain;
      });
      builder.single = vi.fn().mockResolvedValue(handler.select ?? { data: null, error: null });
      builder.maybeSingle = vi
        .fn()
        .mockResolvedValue(handler.select ?? { data: null, error: null });
      builder.then = (resolve: (v: any) => void) =>
        resolve({
          data: handler.select?.data ?? [],
          count: handler.select?.count ?? null,
          error: handler.select?.error ?? null,
        });
      return builder;
    }),
  };
}

describe("POST /api/provider/payout-accounts", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireRoleInApi, getProviderIdForUser } = await import(
      "@/lib/supabase/api-helpers"
    );
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    const { resolveTenantIdWithZaFallback } = await import(
      "@/lib/tenant/resolve-tenant-from-db"
    );
    const { getTenantRegionConfig } = await import("@/lib/regions/config");
    const { resourceTenantMatchesHostTenant } = await import(
      "@/lib/bookings/resolve-payment-tenant"
    );

    vi.mocked(requireRoleInApi).mockResolvedValue({ user: owner } as any);
    vi.mocked(getProviderIdForUser).mockResolvedValue(PROVIDER_ID);
    vi.mocked(getSupabaseServer).mockResolvedValue({} as any);
    vi.mocked(resolveTenantIdWithZaFallback).mockResolvedValue(TENANT_ID);
    vi.mocked(getTenantRegionConfig).mockResolvedValue({
      regionCode: "ZA",
      defaultCurrency: "ZAR",
    } as any);
    vi.mocked(resourceTenantMatchesHostTenant).mockReturnValue(true);
  });

  it("saves the account via the admin client after Paystack verification + recipient creation", async () => {
    const {
      verifyAccount,
      createTransferRecipient,
      deleteTransferRecipient,
    } = await import("@/lib/payments/paystack-complete");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");

    vi.mocked(verifyAccount).mockResolvedValue({
      status: true,
      message: "ok",
      data: { account_name: "Test Owner", account_number: "1234567890" },
    } as any);
    vi.mocked(createTransferRecipient).mockResolvedValue({
      status: true,
      message: "ok",
      data: {
        recipient_code: "RCP_123",
        id: 42,
        type: "basa",
        currency: "ZAR",
        active: true,
        details: {
          account_name: "Test Owner",
          bank_code: "632005",
          bank_name: "Standard Bank",
        },
      },
    } as any);

    const admin = buildAdminMock({
      providers: { select: { data: { tenant_id: TENANT_ID }, error: null } },
      platform_settings: { select: { data: null, error: null } },
      provider_payout_accounts: {
        select: { data: [], error: null },
        insert: {
          data: {
            id: "acc-1",
            provider_id: PROVIDER_ID,
            recipient_code: "RCP_123",
            is_primary: true,
          },
          error: null,
        },
      },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as any);

    const { POST } = await import("../route");
    const response = await POST(
      createMockNextRequest({
        method: "POST",
        url: "http://localhost/api/provider/payout-accounts",
        body: {
          type: "basa",
          country: "ZA",
          account_number: "1234567890",
          bank_code: "632005",
          account_name: "Test Owner",
          currency: "ZAR",
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ id: "acc-1", recipient_code: "RCP_123" });
    expect(deleteTransferRecipient).not.toHaveBeenCalled();
    expect(admin.from).toHaveBeenCalledWith("provider_payout_accounts");
    expect(createTransferRecipient).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "basa",
        name: "Test Owner",
        account_number: "1234567890",
        bank_code: "632005",
        currency: "ZAR",
      }),
      expect.objectContaining({ tenantId: TENANT_ID }),
    );
  });

  it("returns ACCOUNT_VERIFICATION_FAILED when Paystack rejects the bank account", async () => {
    const { verifyAccount, createTransferRecipient } = await import(
      "@/lib/payments/paystack-complete"
    );
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(verifyAccount).mockResolvedValue({
      status: false,
      message: "Could not resolve account name. Please check parameters or try again.",
      data: null,
    } as any);
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      buildAdminMock({
        providers: { select: { data: { tenant_id: TENANT_ID }, error: null } },
        platform_settings: { select: { data: null, error: null } },
      }) as any,
    );

    const { POST } = await import("../route");
    const response = await POST(
      createMockNextRequest({
        method: "POST",
        url: "http://localhost/api/provider/payout-accounts",
        body: {
          type: "basa",
          country: "ZA",
          account_number: "1234567890",
          bank_code: "632005",
          account_name: "Wrong Name",
          currency: "ZAR",
        },
      }) as any,
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("ACCOUNT_VERIFICATION_FAILED");
    expect(body.error.message).toContain("Could not resolve");
    expect(createTransferRecipient).not.toHaveBeenCalled();
  });

  it("rolls back the Paystack recipient when the database insert fails", async () => {
    const {
      verifyAccount,
      createTransferRecipient,
      deleteTransferRecipient,
    } = await import("@/lib/payments/paystack-complete");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");

    vi.mocked(verifyAccount).mockResolvedValue({
      status: true,
      message: "ok",
      data: { account_name: "Test Owner", account_number: "1234567890" },
    } as any);
    vi.mocked(createTransferRecipient).mockResolvedValue({
      status: true,
      message: "ok",
      data: {
        recipient_code: "RCP_456",
        id: 84,
        type: "basa",
        currency: "ZAR",
        active: true,
        details: { account_name: "Test Owner", bank_code: "632005", bank_name: "Standard Bank" },
      },
    } as any);
    vi.mocked(deleteTransferRecipient).mockResolvedValue({
      status: true,
      message: "deleted",
      data: null,
    } as any);
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      buildAdminMock({
        providers: { select: { data: { tenant_id: TENANT_ID }, error: null } },
        platform_settings: { select: { data: null, error: null } },
        provider_payout_accounts: {
          select: { data: [], error: null },
          insert: {
            data: null,
            error: { message: "duplicate key value violates unique constraint" },
          },
        },
      }) as any,
    );

    const { POST } = await import("../route");
    const response = await POST(
      createMockNextRequest({
        method: "POST",
        url: "http://localhost/api/provider/payout-accounts",
        body: {
          type: "basa",
          country: "ZA",
          account_number: "1234567890",
          bank_code: "632005",
          account_name: "Test Owner",
          currency: "ZAR",
        },
      }) as any,
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("DB_SAVE_FAILED");
    expect(deleteTransferRecipient).toHaveBeenCalledWith(
      "RCP_456",
      expect.objectContaining({ tenantId: TENANT_ID }),
    );
  });
});
