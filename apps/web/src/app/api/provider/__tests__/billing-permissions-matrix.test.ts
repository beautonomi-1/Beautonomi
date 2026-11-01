import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

function forbiddenResponse() {
  return {
    authorized: false,
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  };
}

function makeBillingHistoryAdminClient() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => Promise.resolve({ data: [], error: null, count: 0 }));
  return { from: vi.fn(() => chain) };
}

function makeSupabaseChain(result: { data?: unknown; error?: null; count?: number } = {}) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of [
    "select",
    "eq",
    "in",
    "gt",
    "or",
    "order",
    "range",
    "lte",
    "gte",
    "neq",
    "limit",
  ]) {
    chain[m] = vi.fn(self);
  }
  chain.range = vi.fn(() =>
    Promise.resolve({ data: result.data ?? [], error: null, count: result.count ?? 0 }),
  );
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  Object.assign(chain, {
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: result.data ?? [], error: null }),
  });
  return chain;
}

function makeInvoicesServerClient() {
  let invoicesFromCall = 0;
  return {
    from: vi.fn((table: string) => {
      if (table === "provider_invoices") {
        invoicesFromCall += 1;
        if (invoicesFromCall === 1) {
          return makeSupabaseChain({ count: 0 });
        }
        return makeSupabaseChain();
      }
      return makeSupabaseChain();
    }),
  };
}

describe("billing permission matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProviderIdForUser.mockResolvedValue("prov-1");
    mockGetSupabaseAdmin.mockReturnValue(makeBillingHistoryAdminClient());
    mockGetSupabaseServer.mockResolvedValue(makeInvoicesServerClient());
  });

  it("receptionist without manage_finance gets 403 on billing-history", async () => {
    mockRequirePermission.mockResolvedValue(forbiddenResponse());
    const { GET } = await import("../billing-history/route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/billing-history?limit=50"),
    );
    expect(res.status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("manage_finance", expect.anything());
  });

  it("receptionist without manage_finance gets 403 on invoices list", async () => {
    mockRequirePermission.mockResolvedValue(forbiddenResponse());
    const { GET } = await import("../invoices/route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/invoices?page=1&limit=25"),
    );
    expect(res.status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("manage_finance", expect.anything());
  });

  it("manager with manage_finance can list invoices but not submit EFT pay", async () => {
    mockRequirePermission.mockImplementation(async (perm: string) => {
      if (perm === "manage_finance") {
        return { authorized: true, user: { id: "mgr-1" } };
      }
      if (perm === "edit_settings") {
        return forbiddenResponse();
      }
      return forbiddenResponse();
    });

    const { GET } = await import("../invoices/route");
    const listRes = await GET(
      new NextRequest("http://localhost/api/provider/invoices?page=1&limit=25"),
    );
    expect(listRes.status).toBe(200);

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "provider_invoices") {
          const c: Record<string, unknown> = {};
          c.select = vi.fn(() => c);
          c.eq = vi.fn(() => c);
          c.maybeSingle = vi.fn(() =>
            Promise.resolve({
              data: {
                id: "inv-1",
                provider_id: "prov-1",
                total_amount: 100,
                amount_paid: 0,
                amount_due: 100,
                status: "sent",
              },
              error: null,
            }),
          );
          return c;
        }
        throw new Error(table);
      }),
    });

    const { POST } = await import("../invoices/[id]/pay/route");
    const payRes = await POST(
      new NextRequest("http://localhost/api/provider/invoices/inv-1/pay", {
        method: "POST",
        body: JSON.stringify({ amount: 10, paymentReference: "EFT-1" }),
      }),
      { params: Promise.resolve({ id: "inv-1" }) },
    );
    expect(payRes.status).toBe(403);
  });
});
