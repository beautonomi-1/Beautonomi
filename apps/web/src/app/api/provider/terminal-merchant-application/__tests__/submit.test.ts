import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockBuildPrefill = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

// Keep the real validation logic; only stub prefill.
vi.mock("@/lib/terminal-merchant/prefill-and-validation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/terminal-merchant/prefill-and-validation")>();
  return {
    ...actual,
    buildTerminalMerchantPrefill: (...args: unknown[]) => mockBuildPrefill(...args),
  };
});

vi.mock("@/lib/terminal-merchant/events", () => ({
  logTerminalMerchantApplicationEvent: vi.fn(),
}));

vi.mock("@/lib/terminal-merchant/notifications", () => ({
  notifyTerminalMerchantApplicationSubmitted: vi.fn(),
}));

vi.mock("@/lib/integrations/slack/terminal-merchant-triggers", () => ({
  slackNotifyTerminalMerchantSubmitted: vi.fn(),
}));

function makeSupabase(results: Record<string, unknown>) {
  function chainFor(table: string) {
    let op = "select";
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: () => ((op = "insert"), chain),
      update: () => ((op = "update"), chain),
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

function makeRequest() {
  return new NextRequest("http://localhost/api/provider/terminal-merchant-application/submit", {
    method: "POST",
  });
}

const COMPLETE_APP = {
  id: "app-1",
  application_no: "TMO-000001",
  status: "draft",
  provider_id: "prov-1",
  first_name: "Thandi",
  last_name: "Mokoena",
  email: "thandi@example.com",
  phone: "+27820000000",
  id_type: "national_id",
  id_number: "9001010000080",
  otp_phone: "+27820000000",
  entity_type: "sole_proprietor",
  legal_name: "Thandi Mokoena",
  trading_name: "Glow Studio",
  physical_line1: "1 Main Rd",
  physical_city: "Cape Town",
  physical_province: "Western Cape",
  physical_postal_code: "8001",
  postal_same_as_physical: true,
  bank_code: "632005",
  account_type: "cheque_current",
  account_holder: "Thandi Mokoena",
  account_number_last4: "1234",
  fulfillment_method: "delivery",
  delivery_line1: "1 Main Rd",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1", role: "provider_owner" } });
  mockGetProviderIdForUser.mockResolvedValue("prov-1");
  mockGetSupabaseServer.mockResolvedValue({});
  mockBuildPrefill.mockResolvedValue({ identity_verified: true });
});

describe("POST /api/provider/terminal-merchant-application/submit", () => {
  it("returns 400 with issues when application is incomplete", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeSupabase({
        "terminal_merchant_applications:select": { ...COMPLETE_APP, first_name: "", legal_name: "" },
        "terminal_merchant_application_documents:select": [],
      }),
    );
    const { POST } = await import("../submit/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details.issues)).toBe(true);
    expect(body.error.details.issues.length).toBeGreaterThan(0);
  });

  it("submits when application and documents are complete", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeSupabase({
        "terminal_merchant_applications:select": COMPLETE_APP,
        "terminal_merchant_application_documents:select": [
          { doc_type: "proof_of_address", status: "pending" },
          { doc_type: "bank_confirmation_letter", status: "pending" },
        ],
        "terminal_merchant_applications:update": { ...COMPLETE_APP, status: "submitted" },
        providers: { business_name: "Glow", user_id: "user-1", tenant_id: "tenant-1" },
      }),
    );
    const { POST } = await import("../submit/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.application.status).toBe("submitted");
  });

  it("blocks submit when already submitted", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeSupabase({
        "terminal_merchant_applications:select": { ...COMPLETE_APP, status: "in_review" },
      }),
    );
    const { POST } = await import("../submit/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_STATUS");
  });
});
