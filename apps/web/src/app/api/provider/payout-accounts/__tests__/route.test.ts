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
 *  - Duplicate Paystack recipient codes surface as a 409 without deleting the
 *    already-stored recipient.
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

vi.mock("@/lib/auth/permissions", () => ({
  isProviderOwner: vi.fn(async () => true),
  hasPermission: vi.fn(async () => false),
}));

vi.mock("@/lib/payments/paystack-complete", () => ({
  verifyAccount: vi.fn(),
  createTransferRecipient: vi.fn(),
  deleteTransferRecipient: vi.fn(),
}));

vi.mock("@/lib/payments/payout-rail", () => ({
  resolvePayoutRailForTenant: vi.fn(async () => "paystack"),
}));

vi.mock("@/lib/payments/flutterwave-banks", () => ({
  resolveFlutterwaveBankAccount: vi.fn(),
}));

vi.mock("@/lib/verification/apply-payout-name-match", () => ({
  applyPayoutNameMatchForAccount: vi.fn(async () => {}),
}));

// F2-10 made step-up enforce-by-default; the step-up gate has its own tests in
// lib/auth/__tests__/provider-security.test.ts. Here we only exercise the Paystack flow.
vi.mock("@/lib/auth/provider-security", () => ({
  requireStepUp: vi.fn(async () => {}),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(async () => {}),
  extractRequestMeta: vi.fn(() => ({ ip_address: "203.0.113.9", user_agent: "vitest" })),
}));

vi.mock("@/lib/auth/payout-cooling-off", () => ({
  providerHasAnyPayoutAccount: vi.fn(async () => false),
  notifyPayoutAccountChange: vi.fn(async () => {}),
}));

vi.mock("@/lib/auth/resolve-new-account-cooling-off", () => ({
  resolveCoolingOffUntilForNewAccount: vi.fn(async () => null),
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

    // F2-09: bank-account changes must leave an audit trail (no full account number).
    const { writeAuditLog } = await import("@/lib/audit/audit");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "provider.payout_account.added",
        entity_type: "provider_payout_account",
        entity_id: "acc-1",
        actor_user_id: owner.id,
        module: "finance",
        risk_level: "high",
        retention_tier: "financial",
        ip_address: "203.0.113.9",
        metadata: expect.objectContaining({
          provider_id: PROVIDER_ID,
          account_number_last4: "7890",
          payout_rail: "paystack",
        }),
      }),
    );
    const auditJson = JSON.stringify(vi.mocked(writeAuditLog).mock.calls);
    expect(auditJson).not.toContain("1234567890");
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

  it("returns the existing row when the Paystack recipient code is already stored for this provider", async () => {
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
        recipient_code: "RCP_DUPLICATE",
        id: 84,
        type: "basa",
        currency: "ZAR",
        active: true,
        details: { account_name: "Test Owner", bank_code: "632005", bank_name: "Standard Bank" },
      },
    } as any);
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      buildAdminMock({
        providers: { select: { data: { tenant_id: TENANT_ID }, error: null } },
        platform_settings: { select: { data: null, error: null } },
        provider_payout_accounts: {
          select: {
            data: {
              id: "acc-existing",
              provider_id: PROVIDER_ID,
              recipient_code: "RCP_DUPLICATE",
              account_number_last4: "7890",
              account_name: "Test Owner",
              active: true,
            },
            error: null,
          },
          insert: {
            data: null,
            error: {
              code: "23505",
              message:
                'duplicate key value violates unique constraint "provider_payout_accounts_recipient_code_key"',
            },
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

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ id: "acc-existing", recipient_code: "RCP_DUPLICATE" });
    expect(deleteTransferRecipient).not.toHaveBeenCalled();
  });

  it("saves Flutterwave payout accounts without creating a Paystack transfer recipient", async () => {
    const { createTransferRecipient } = await import("@/lib/payments/paystack-complete");
    const { resolvePayoutRailForTenant } = await import("@/lib/payments/payout-rail");
    const { resolveFlutterwaveBankAccount } = await import("@/lib/payments/flutterwave-banks");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");

    vi.mocked(resolvePayoutRailForTenant).mockResolvedValue("flutterwave");
    vi.mocked(resolveFlutterwaveBankAccount).mockResolvedValue({ account_name: "FW Owner" });

    const admin = buildAdminMock({
      providers: { select: { data: { tenant_id: TENANT_ID }, error: null } },
      platform_settings: { select: { data: null, error: null } },
      provider_payout_accounts: {
        select: { data: [], error: null },
        insert: {
          data: {
            id: "acc-fw-1",
            provider_id: PROVIDER_ID,
            recipient_code: "fw:632005:1234567890",
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
          account_name: "FW Owner",
          currency: "ZAR",
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      id: "acc-fw-1",
      recipient_code: "fw:632005:1234567890",
    });
    expect(createTransferRecipient).not.toHaveBeenCalled();
    expect(resolveFlutterwaveBankAccount).toHaveBeenCalled();

    const { writeAuditLog } = await import("@/lib/audit/audit");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "provider.payout_account.added",
        entity_id: "acc-fw-1",
        metadata: expect.objectContaining({ payout_rail: "flutterwave", account_number_last4: "7890" }),
      }),
    );
  });
});

describe("PATCH/DELETE /api/provider/payout-accounts/[id] (F2-09 audit trail)", () => {
  const ACCOUNT_ID = "33333333-3333-3333-3333-333333333333";

  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireRoleInApi, getProviderIdForUser } = await import(
      "@/lib/supabase/api-helpers"
    );
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    const { resolveTenantIdWithZaFallback } = await import(
      "@/lib/tenant/resolve-tenant-from-db"
    );
    const { resourceTenantMatchesHostTenant } = await import(
      "@/lib/bookings/resolve-payment-tenant"
    );
    vi.mocked(requireRoleInApi).mockResolvedValue({ user: owner } as any);
    vi.mocked(getProviderIdForUser).mockResolvedValue(PROVIDER_ID);
    vi.mocked(getSupabaseServer).mockResolvedValue({} as any);
    vi.mocked(resolveTenantIdWithZaFallback).mockResolvedValue(TENANT_ID);
    vi.mocked(resourceTenantMatchesHostTenant).mockReturnValue(true);
  });

  it("PATCH writes an audit log with before/after and changed fields", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const existing = {
      id: ACCOUNT_ID,
      provider_id: PROVIDER_ID,
      recipient_code: "RCP_123",
      account_name: "Old Name",
      account_number_last4: "7890",
      bank_name: "Standard Bank",
      active: true,
      is_primary: true,
      metadata: {},
    };
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      buildAdminMock({
        providers: { select: { data: { tenant_id: TENANT_ID }, error: null } },
        provider_payout_accounts: {
          select: { data: existing, error: null },
          update: { data: { ...existing, account_name: "New Name" }, error: null },
        },
      }) as any,
    );

    const { PATCH } = await import("../[id]/route");
    const response = await PATCH(
      createMockNextRequest({
        method: "PATCH",
        url: `http://localhost/api/provider/payout-accounts/${ACCOUNT_ID}`,
        body: { account_name: "New Name" },
      }) as any,
      { params: Promise.resolve({ id: ACCOUNT_ID }) },
    );
    expect(response.status).toBe(200);

    const { writeAuditLog } = await import("@/lib/audit/audit");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "provider.payout_account.updated",
        entity_type: "provider_payout_account",
        entity_id: ACCOUNT_ID,
        actor_user_id: owner.id,
        module: "finance",
        risk_level: "high",
        retention_tier: "financial",
        before_json: expect.objectContaining({ account_name: "Old Name" }),
        after_json: expect.objectContaining({ account_name: "New Name" }),
        metadata: expect.objectContaining({
          provider_id: PROVIDER_ID,
          changed_fields: ["account_name"],
        }),
      }),
    );
  });

  it("DELETE writes an audit log for the soft-deleted account", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      buildAdminMock({
        providers: { select: { data: { tenant_id: TENANT_ID }, error: null } },
        provider_payout_accounts: {
          select: {
            data: {
              id: ACCOUNT_ID,
              provider_id: PROVIDER_ID,
              account_number_last4: "7890",
              bank_name: "Standard Bank",
              active: true,
              is_primary: false,
            },
            error: null,
          },
          update: { data: null, error: null },
        },
      }) as any,
    );

    const { DELETE } = await import("../[id]/route");
    const response = await DELETE(
      createMockNextRequest({
        method: "DELETE",
        url: `http://localhost/api/provider/payout-accounts/${ACCOUNT_ID}`,
      }) as any,
      { params: Promise.resolve({ id: ACCOUNT_ID }) },
    );
    expect(response.status).toBe(200);

    const { writeAuditLog } = await import("@/lib/audit/audit");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "provider.payout_account.removed",
        entity_type: "provider_payout_account",
        entity_id: ACCOUNT_ID,
        actor_user_id: owner.id,
        risk_level: "high",
        retention_tier: "financial",
        metadata: expect.objectContaining({
          provider_id: PROVIDER_ID,
          account_number_last4: "7890",
          bank_name: "Standard Bank",
        }),
      }),
    );
  });
});
