import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAdminSection = vi.fn();
const mockResolveAdminApiTenantId = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockUngate = vi.fn();
const mockLogEvent = vi.fn();
const mockCreateSupportTicket = vi.fn();

vi.mock("@/lib/terminal-merchant/admin-auth", () => ({
  requireTerminalMerchantAdmin: (...args: unknown[]) => mockRequireAdminSection(...args),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) => mockResolveAdminApiTenantId(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/terminal-merchant/gate", () => ({
  ungateOrdersAfterApproval: (...args: unknown[]) => mockUngate(...args),
  getOrCreateDraftApplication: vi.fn(),
}));

vi.mock("@/lib/terminal-merchant/events", () => ({
  logTerminalMerchantApplicationEvent: (...args: unknown[]) => mockLogEvent(...args),
  encryptAccountNumber: () => ({ encrypted: "enc", last4: "1234" }),
  decryptAccountNumberForExport: () => null,
}));

vi.mock("@/lib/terminal-merchant/notifications", () => ({
  notifyTerminalMerchantApplicationApproved: vi.fn(),
  notifyTerminalMerchantApplicationInfoRequired: vi.fn(),
  notifyTerminalMerchantApplicationTermSheetSent: vi.fn(),
  notifyTerminalMerchantApplicationDeclined: vi.fn(),
}));

vi.mock("@/lib/integrations/slack/terminal-merchant-triggers", () => ({
  slackNotifyTerminalMerchantApproved: vi.fn(),
  slackNotifyTerminalMerchantTermSheetAccepted: vi.fn(),
}));

vi.mock("@/lib/terminal-merchant/support-ticket", () => ({
  createSupportTicketForProvider: (...args: unknown[]) => mockCreateSupportTicket(...args),
}));

/**
 * Flexible Supabase mock. `results` maps `${table}:${op}` → resolved row(s).
 * Terminal resolvers: maybeSingle/single return `{ data, error }`.
 */
function makeSupabase(results: Record<string, unknown>) {
  function chainFor(table: string) {
    let op = "select";
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: () => {
        op = "insert";
        return chain;
      },
      update: () => {
        op = "update";
        return chain;
      },
      delete: () => {
        op = "delete";
        return chain;
      },
      eq: () => chain,
      is: () => chain,
      not: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: results[`${table}:${op}`] ?? null, error: null }),
      single: async () => ({ data: results[`${table}:${op}`] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: results[`${table}:${op}`] ?? [], error: null }),
    };
    return chain;
  }
  return { from: (table: string) => chainFor(table) };
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/terminal-merchant-applications/app-1/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const APP_ROW = {
  id: "app-1",
  application_no: "TMO-000001",
  status: "awaiting_term_sheet",
  provider_id: "prov-1",
  trading_name: "Glow Studio",
  otp_phone: "+27820000000",
  providers: { id: "prov-1", business_name: "Glow", user_id: "user-1", tenant_id: "tenant-1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSection.mockResolvedValue({ user: { id: "admin-1", role: "superadmin" } });
  mockResolveAdminApiTenantId.mockResolvedValue("tenant-1");
  mockUngate.mockResolvedValue(undefined);
  mockLogEvent.mockResolvedValue(undefined);
});

describe("POST /approve", () => {
  it("rejects when merchant_no/store_no missing", async () => {
    mockGetSupabaseAdmin.mockReturnValue(makeSupabase({}));
    const { POST } = await import("../[id]/approve/route");
    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("blocks re-approve when already approved", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeSupabase({
        "terminal_merchant_applications:select": {
          ...APP_ROW,
          status: "approved",
          paycloud_merchant_id: "merch-existing",
        },
      }),
    );
    const { POST } = await import("../[id]/approve/route");
    const res = await POST(makeRequest({ merchant_no: "M1", store_no: "S1" }), {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ALREADY_APPROVED");
  });

  it("creates merchant, approves, and ungates orders", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeSupabase({
        "terminal_merchant_applications:select": APP_ROW,
        "paycloud_merchants:insert": { id: "merch-1", merchant_no: "M1", store_no: "S1" },
        "terminal_merchant_applications:update": { ...APP_ROW, status: "approved" },
      }),
    );
    const { POST } = await import("../[id]/approve/route");
    const res = await POST(makeRequest({ merchant_no: "M1", store_no: "S1" }), {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.application.status).toBe("approved");
    expect(body.data.paycloud_merchant.id).toBe("merch-1");
    expect(mockUngate).toHaveBeenCalledWith(expect.anything(), "app-1");
  });
});

describe("POST /status", () => {
  it("cancels an application", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeSupabase({
        "terminal_merchant_applications:select": APP_ROW,
        "terminal_merchant_applications:update": { ...APP_ROW, status: "cancelled" },
      }),
    );
    const { POST } = await import("../[id]/status/route");
    const res = await POST(makeRequest({ status: "cancelled" }), {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.application.status).toBe("cancelled");
  });

  it("requires status or term_sheet_status", async () => {
    mockGetSupabaseAdmin.mockReturnValue(makeSupabase({}));
    const { POST } = await import("../[id]/status/route");
    const res = await POST(makeRequest({ acquirer_reference: "ref-1" }), {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("opens a support ticket when requesting info", async () => {
    mockCreateSupportTicket.mockResolvedValue("ticket-1");
    mockGetSupabaseAdmin.mockReturnValue(
      makeSupabase({
        "terminal_merchant_applications:select": { ...APP_ROW, status: "in_review" },
        "terminal_merchant_applications:update": { ...APP_ROW, status: "info_required" },
      }),
    );
    const { POST } = await import("../[id]/status/route");
    const res = await POST(
      makeRequest({
        status: "info_required",
        info_required_reason: "Please re-upload ID",
        create_support_ticket: true,
      }),
      { params: Promise.resolve({ id: "app-1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockCreateSupportTicket).toHaveBeenCalled();
  });
});
