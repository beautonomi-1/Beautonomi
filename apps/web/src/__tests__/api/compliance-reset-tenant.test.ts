/**
 * Tests for POST /api/admin/compliance/reset-tenant
 *
 * The reset-tenant route is the single most destructive admin endpoint on the
 * platform — a bad run wipes every transactional row for a tenant. These tests
 * lock in the full defense-in-depth contract:
 *
 *   1. Only superadmins can hit it (delegated to requireRoleInApi, but we
 *      assert the route surfaces the rejection properly).
 *   2. The zod body schema rejects anything missing the phrase /
 *      acknowledgement / slug / reason.
 *   3. tenant_slug_confirmation must match the tenants.slug for the given id.
 *   4. The default ZA tenant safeguard returns 409 DEFAULT_TENANT_BLOCKED and
 *      does NOT write a compliance audit row.
 *   5. Dry-runs return counts but never insert a compliance_purge_audit_log
 *      row (those are reserved for live, irreversible deletions).
 *   6. Live runs write the compliance_purge_audit_log row and the generic
 *      audit log, and surface the returned audit id back to the caller.
 */

import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "../helpers/mock-supabase";

// ---------------------------------------------------------------------------
// Mocks (hoisted)
// ---------------------------------------------------------------------------

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveAdminApiTenantId = vi.fn();
const mockInsertCompliancePurgeAuditLog = vi.fn();
const mockWriteAuditLog = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  successResponse: (data: unknown, status = 200) =>
    new Response(JSON.stringify({ data, error: null }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  handleApiError: (error: unknown, message = "Error") =>
    new Response(
      JSON.stringify({
        data: null,
        error: {
          message: `${message}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    ),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) =>
    mockResolveAdminApiTenantId(...args),
}));

vi.mock("@/lib/account/compliance-purge-audit", () => ({
  insertCompliancePurgeAuditLog: (...args: unknown[]) =>
    mockInsertCompliancePurgeAuditLog(...args),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROUTE_URL = "http://localhost:3000/api/admin/compliance/reset-tenant";

const VALID_TENANT_ID = "11111111-1111-4111-8111-111111111111";
const VALID_SLUG = "acme-salon";
const VALID_REASON =
  "Regulatory cleanup ahead of tenant decommission — see ticket COMP-1742.";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: VALID_TENANT_ID,
    tenant_slug_confirmation: VALID_SLUG,
    reason: VALID_REASON,
    confirmation_phrase: "RESET TENANT TRANSACTIONS",
    acknowledge_irreversible: true,
    dry_run: false,
    allow_default_tenant: false,
    ...overrides,
  };
}

/**
 * Shape of the `admin` client that the route uses.
 *
 *   admin.from("tenants").select(...).eq(...).maybeSingle()  — tenant lookup
 *   admin.rpc("compliance_reset_tenant_transactions", ...)   — the reset fn
 *
 * We only need those two call paths to be chainable.
 */
function buildAdminClient(opts: {
  tenantRow: { id: string; slug: string; name: string | null } | null;
  tenantErr?: { message: string } | null;
  rpcResult?: unknown;
  rpcError?: { message: string } | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: opts.tenantRow,
    error: opts.tenantErr ?? null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  const rpc = vi.fn().mockResolvedValue({
    data: opts.rpcResult ?? null,
    error: opts.rpcError ?? null,
  });

  return { from, rpc, select, eq, maybeSingle };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/compliance/reset-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
    mockResolveAdminApiTenantId.mockResolvedValue(VALID_TENANT_ID);
    mockInsertCompliancePurgeAuditLog.mockResolvedValue({
      ok: true,
      id: "audit-log-id",
    });
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("rejects when the caller is not a superadmin", async () => {
    mockRequireRoleInApi.mockRejectedValue(new Error("Insufficient permissions"));

    const { POST } = await import(
      "@/app/api/admin/compliance/reset-tenant/route"
    );
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody(),
      }) as NextRequest,
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.data).toBeNull();
    expect(body.error?.message).toMatch(/Insufficient permissions/);
  });

  it("rejects a body missing the confirmation phrase", async () => {
    const admin = buildAdminClient({
      tenantRow: { id: VALID_TENANT_ID, slug: VALID_SLUG, name: "Acme" },
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import(
      "@/app/api/admin/compliance/reset-tenant/route"
    );
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody({ confirmation_phrase: "yes delete" }),
      }) as NextRequest,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mockInsertCompliancePurgeAuditLog).not.toHaveBeenCalled();
  });

  it("rejects a reason shorter than 20 characters", async () => {
    const admin = buildAdminClient({
      tenantRow: { id: VALID_TENANT_ID, slug: VALID_SLUG, name: "Acme" },
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import(
      "@/app/api/admin/compliance/reset-tenant/route"
    );
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody({ reason: "too short" }),
      }) as NextRequest,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("rejects when acknowledge_irreversible is false", async () => {
    const admin = buildAdminClient({
      tenantRow: { id: VALID_TENANT_ID, slug: VALID_SLUG, name: "Acme" },
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import(
      "@/app/api/admin/compliance/reset-tenant/route"
    );
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody({ acknowledge_irreversible: false }),
      }) as NextRequest,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("returns 404 when the tenant does not exist", async () => {
    const admin = buildAdminClient({ tenantRow: null });
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import(
      "@/app/api/admin/compliance/reset-tenant/route"
    );
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody(),
      }) as NextRequest,
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error?.code).toBe("TENANT_NOT_FOUND");
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mockInsertCompliancePurgeAuditLog).not.toHaveBeenCalled();
  });

  it("returns 400 when tenant_slug_confirmation does not match the stored slug", async () => {
    const admin = buildAdminClient({
      tenantRow: { id: VALID_TENANT_ID, slug: "different-slug", name: "Acme" },
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import(
      "@/app/api/admin/compliance/reset-tenant/route"
    );
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody({ tenant_slug_confirmation: "acme-salon" }),
      }) as NextRequest,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe("SLUG_CONFIRMATION_MISMATCH");
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mockInsertCompliancePurgeAuditLog).not.toHaveBeenCalled();
  });

  it("maps the default-tenant guard error to 409 DEFAULT_TENANT_BLOCKED and writes no audit row", async () => {
    const admin = buildAdminClient({
      tenantRow: { id: VALID_TENANT_ID, slug: VALID_SLUG, name: "Acme" },
      rpcError: {
        message:
          "Cannot reset the default ZA tenant without p_allow_default_tenant=true",
      },
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import(
      "@/app/api/admin/compliance/reset-tenant/route"
    );
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody(),
      }) as NextRequest,
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error?.code).toBe("DEFAULT_TENANT_BLOCKED");
    expect(mockInsertCompliancePurgeAuditLog).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("maps other rpc errors to 500 RPC_ERROR", async () => {
    const admin = buildAdminClient({
      tenantRow: { id: VALID_TENANT_ID, slug: VALID_SLUG, name: "Acme" },
      rpcError: { message: "deadlock detected" },
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import(
      "@/app/api/admin/compliance/reset-tenant/route"
    );
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody(),
      }) as NextRequest,
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error?.code).toBe("RPC_ERROR");
    expect(mockInsertCompliancePurgeAuditLog).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("dry-run: returns counts but does NOT write a compliance_purge_audit_log row", async () => {
    const rpcResult = {
      tenant_id: VALID_TENANT_ID,
      tenant_slug: VALID_SLUG,
      dry_run: true,
      started_at: "2026-04-17T10:00:00.000Z",
      completed_at: "2026-04-17T10:00:01.000Z",
      counts: {
        bookings: { rows: 12 },
        booking_payments: { rows: 4 },
        reviews: { rows: 0, via: "bookings" },
      },
    };
    const admin = buildAdminClient({
      tenantRow: { id: VALID_TENANT_ID, slug: VALID_SLUG, name: "Acme" },
      rpcResult,
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import(
      "@/app/api/admin/compliance/reset-tenant/route"
    );
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody({ dry_run: true }),
      }) as NextRequest,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data?.dry_run).toBe(true);
    expect(body.data?.counts).toEqual(rpcResult.counts);
    expect(body.data?.totals?.tables).toBe(3);
    expect(body.data?.totals?.rows).toBe(16);
    expect(body.data?.compliance_audit_id).toBeNull();

    expect(admin.rpc).toHaveBeenCalledWith(
      "compliance_reset_tenant_transactions",
      {
        p_tenant_id: VALID_TENANT_ID,
        p_dry_run: true,
        p_allow_default_tenant: false,
      },
    );
    expect(mockInsertCompliancePurgeAuditLog).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("dry-run: surfaces terminal commerce + PayCloud/Yoco/membership keys from migration 764/765/815", async () => {
    const terminalCounts = {
      terminal_campaign_recipients: { rows: 2, via: "terminal_campaign" },
      terminal_campaigns: { rows: 1, via: "tenant_id" },
      terminal_admin_notes: { rows: 0, via: "tenant_id" },
      provider_terminal_payment_allocations: { rows: 3, via: "provider" },
      provider_paystack_terminal_payments: { rows: 5, via: "provider" },
      provider_paystack_virtual_terminal_setup_requests: { rows: 0, via: "provider" },
      terminal_assets: { rows: 1, via: "tenant_id" },
      terminal_orders: { rows: 4, via: "tenant_id" },
      fee_reconciliations: { rows: 7, via: "tenant_id" },
      paycloud_webhook_events: { rows: 2, via: "paycloud" },
      provider_paycloud_payments: { rows: 6, via: "tenant_id" },
      provider_yoco_webhook_events: { rows: 1, via: "yoco" },
      provider_yoco_refunds: { rows: 0, via: "yoco" },
      provider_yoco_payments: { rows: 3, via: "provider" },
      terminal_merchant_application_documents: { rows: 2, via: "merchant_application" },
      terminal_merchant_application_events: { rows: 4, via: "merchant_application" },
      terminal_merchant_applications: { rows: 1, via: "tenant_id" },
      customer_memberships: { rows: 2, via: "provider" },
      user_memberships: { rows: 1, via: "provider" },
      _paycloud_terminal_counters_reset: { terminals_affected: 2, via: "recompute_preview" },
    };
    const rpcResult = {
      tenant_id: VALID_TENANT_ID,
      tenant_slug: VALID_SLUG,
      dry_run: true,
      started_at: "2026-07-04T10:00:00.000Z",
      completed_at: "2026-07-04T10:00:01.000Z",
      counts: {
        bookings: { rows: 0 },
        ...terminalCounts,
      },
    };
    const admin = buildAdminClient({
      tenantRow: { id: VALID_TENANT_ID, slug: VALID_SLUG, name: "Acme" },
      rpcResult,
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import(
      "@/app/api/admin/compliance/reset-tenant/route"
    );
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody({ dry_run: true }),
      }) as NextRequest,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    for (const table of Object.keys(terminalCounts)) {
      expect(body.data?.counts?.[table]).toEqual(
        terminalCounts[table as keyof typeof terminalCounts],
      );
    }
  });

  it("live run: writes compliance_purge_audit_log AND the generic audit log and surfaces the audit id", async () => {
    const rpcResult = {
      tenant_id: VALID_TENANT_ID,
      tenant_slug: VALID_SLUG,
      dry_run: false,
      started_at: "2026-04-17T10:00:00.000Z",
      completed_at: "2026-04-17T10:00:02.000Z",
      counts: {
        bookings: { rows: 12 },
        booking_payments: { rows: 4 },
      },
    };
    const admin = buildAdminClient({
      tenantRow: { id: VALID_TENANT_ID, slug: VALID_SLUG, name: "Acme Salon" },
      rpcResult,
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import(
      "@/app/api/admin/compliance/reset-tenant/route"
    );
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody(),
      }) as NextRequest,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data?.dry_run).toBe(false);
    expect(body.data?.compliance_audit_id).toBe("audit-log-id");
    expect(body.data?.totals?.rows).toBe(16);

    expect(mockInsertCompliancePurgeAuditLog).toHaveBeenCalledTimes(1);
    const auditArgs = mockInsertCompliancePurgeAuditLog.mock.calls[0]?.[1];
    expect(auditArgs).toMatchObject({
      actor_user_id: MOCK_USERS.superadmin.id,
      tenant_id: VALID_TENANT_ID,
      purge_type: "tenant_reset",
      reason: VALID_REASON,
    });
    expect(auditArgs?.report?.purge_type).toBe("tenant_reset");
    expect(auditArgs?.report?.operations?.tenant_reset_counts).toEqual(
      rpcResult.counts,
    );
    expect(auditArgs?.report?.operations?.tenant_reset_dry_run).toBe(false);
    expect(auditArgs?.report?.snapshot).toMatchObject({
      tenant_id: VALID_TENANT_ID,
      tenant_slug: VALID_SLUG,
      target_tenant_name: "Acme Salon",
    });

    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    const auditLogCall = mockWriteAuditLog.mock.calls[0]?.[0];
    expect(auditLogCall).toMatchObject({
      actor_user_id: MOCK_USERS.superadmin.id,
      action: "admin.tenant.transactional_reset",
      entity_type: "tenant",
      entity_id: VALID_TENANT_ID,
    });
    expect(auditLogCall?.metadata?.total_tables).toBe(2);
    expect(auditLogCall?.metadata?.total_rows).toBe(16);
    expect(auditLogCall?.metadata?.compliance_audit_row).toEqual({
      id: "audit-log-id",
    });
  });

  it("live run: surfaces audit-insert errors without failing the overall response", async () => {
    mockInsertCompliancePurgeAuditLog.mockResolvedValue({
      ok: false,
      error: "insert failed",
    });

    const rpcResult = {
      tenant_id: VALID_TENANT_ID,
      tenant_slug: VALID_SLUG,
      dry_run: false,
      started_at: "2026-04-17T10:00:00.000Z",
      completed_at: "2026-04-17T10:00:02.000Z",
      counts: { bookings: { rows: 1 } },
    };
    const admin = buildAdminClient({
      tenantRow: { id: VALID_TENANT_ID, slug: VALID_SLUG, name: "Acme" },
      rpcResult,
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import(
      "@/app/api/admin/compliance/reset-tenant/route"
    );
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody(),
      }) as NextRequest,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data?.compliance_audit_id).toBeNull();
    expect(body.data?.compliance_audit_write_error).toBe("insert failed");

    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    const metadata = mockWriteAuditLog.mock.calls[0]?.[0]?.metadata;
    expect(metadata?.compliance_audit_row).toEqual({ error: "insert failed" });
  });
});
