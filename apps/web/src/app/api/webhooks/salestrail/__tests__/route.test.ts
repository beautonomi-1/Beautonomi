import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockListConfigs = vi.fn();

vi.mock("@/lib/integrations/calls-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/calls-config")>();
  return {
    ...actual,
    listEnabledSalestrailConfigs: (...args: unknown[]) => mockListConfigs(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

function configRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cfg-1",
    tenant_id: null,
    twilio_voice_enabled: false,
    salestrail_enabled: true,
    salestrail_webhook_username: "st-user",
    salestrail_webhook_password: "st-pass",
    salestrail_default_tenant_id: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeRequest(payload: unknown, auth = basicAuth("st-user", "st-pass")) {
  return new NextRequest("http://localhost/api/webhooks/salestrail", {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function leadChain(leadData: { data: unknown[]; error: null }) {
  // The route optionally appends .eq("tenant_id", …) after .limit(); otherwise
  // the builder itself is awaited, so it must be a working thenable.
  const eqTenant = vi.fn(() => Promise.resolve(leadData));
  const tail = {
    eq: eqTenant,
    then: (
      onFulfilled?: (v: typeof leadData) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(leadData).then(onFulfilled, onRejected),
  };
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => tail);
  return { chain, eqTenant };
}

describe("POST /api/webhooks/salestrail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockListConfigs.mockResolvedValue([configRow()]);
  });

  it("returns 401 for bad Basic Auth", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn() } as never);

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({ callId: "call-1", number: "+27123456789" }, basicAuth("wrong", "creds")),
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when no Salestrail config is enabled", async () => {
    mockListConfigs.mockResolvedValue([]);
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn() } as never);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ callId: "call-1", number: "+27123456789" }));
    expect(res.status).toBe(503);
  });

  it("returns matched false when lead not found", async () => {
    const from = vi.fn((table: string) => {
      if (table === "provider_lead_communications") {
        return {
          select: vi.fn(() => {
            const sel: Record<string, ReturnType<typeof vi.fn>> = {};
            sel.eq = vi.fn(() => sel);
            sel.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
            return sel;
          }),
        };
      }
      if (table === "provider_leads") {
        return { select: vi.fn(() => leadChain({ data: [], error: null }).chain) };
      }
      return {};
    });

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        callId: "900d8b36-231a-460f-b475-bc768fe8a64c",
        formattedNumber: "+27111222333",
        answered: true,
        inbound: false,
        duration: 120,
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.matched).toBe(false);
  });

  it("matches tenant-scoped config credentials and scopes lead lookup to that tenant", async () => {
    mockListConfigs.mockResolvedValue([
      configRow({
        id: "cfg-tenant",
        tenant_id: "tenant-a",
        salestrail_webhook_username: "tenant-user",
        salestrail_webhook_password: "tenant-pass",
      }),
      configRow(),
    ]);

    const { chain, eqTenant } = leadChain({
      data: [
        {
          id: "lead-a",
          tenant_id: "tenant-a",
          phone_e164: "+27111222333",
          business_name: "Tenant Salon",
        },
      ],
      error: null,
    });

    const inserts: unknown[] = [];
    const from = vi.fn((table: string) => {
      if (table === "provider_lead_communications") {
        return {
          select: vi.fn(() => {
            const sel: Record<string, ReturnType<typeof vi.fn>> = {};
            sel.eq = vi.fn(() => sel);
            sel.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
            return sel;
          }),
          insert: vi.fn((row: unknown) => {
            inserts.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "provider_leads") {
        return { select: vi.fn(() => chain) };
      }
      if (table === "provider_lead_activities") {
        return {
          insert: vi.fn((row: unknown) => {
            inserts.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {};
    });

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest(
        {
          callId: "aaaa1111-2222-3333-4444-555566667777",
          formattedNumber: "+27111222333",
          answered: true,
          inbound: false,
          duration: 60,
        },
        basicAuth("tenant-user", "tenant-pass"),
      ),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.matched).toBe(true);
    expect(body.lead_id).toBe("lead-a");
    // Lead query was scoped to the matched config's tenant.
    expect(eqTenant).toHaveBeenCalledWith("tenant_id", "tenant-a");
    expect(inserts.length).toBe(2);
  });

  it("logs call when lead matches and dedupes on callId", async () => {
    const inserts: unknown[] = [];
    let commsLookup = 0;

    const { chain } = leadChain({
      data: [
        {
          id: "lead-1",
          tenant_id: "tenant-1",
          phone_e164: "+27111222333",
          business_name: "Test Salon",
        },
      ],
      error: null,
    });

    const from = vi.fn((table: string) => {
      if (table === "provider_lead_communications") {
        return {
          select: vi.fn(() => {
            const sel: Record<string, ReturnType<typeof vi.fn>> = {};
            sel.eq = vi.fn(() => sel);
            sel.maybeSingle = vi.fn().mockImplementation(async () => {
              commsLookup += 1;
              if (commsLookup > 1) {
                return { data: { id: "existing" }, error: null };
              }
              return { data: null, error: null };
            });
            return sel;
          }),
          insert: vi.fn((row: unknown) => {
            inserts.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "provider_leads") {
        return { select: vi.fn(() => chain) };
      }
      if (table === "provider_lead_activities") {
        return {
          insert: vi.fn((row: unknown) => {
            inserts.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {};
    });

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);

    const { POST } = await import("../route");
    const payload = {
      callId: "900d8b36-231a-460f-b475-bc768fe8a64c",
      formattedNumber: "+27111222333",
      answered: true,
      inbound: false,
      duration: 90,
      userName: "Rep One",
      userEmail: "rep@test.com",
    };

    const res1 = await POST(makeRequest(payload));
    const body1 = await res1.json();
    expect(res1.status).toBe(200);
    expect(body1.matched).toBe(true);
    expect(inserts.length).toBe(2);

    const res2 = await POST(makeRequest(payload));
    const body2 = await res2.json();
    expect(body2.deduped).toBe(true);
  });

  it("treats a unique violation on insert as an already-logged call", async () => {
    const { chain } = leadChain({
      data: [
        {
          id: "lead-1",
          tenant_id: "tenant-1",
          phone_e164: "+27111222333",
          business_name: "Test Salon",
        },
      ],
      error: null,
    });

    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "provider_lead_communications") {
        return {
          select: vi.fn(() => {
            const sel: Record<string, ReturnType<typeof vi.fn>> = {};
            sel.eq = vi.fn(() => sel);
            sel.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
            return sel;
          }),
          insert: vi.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate" } }),
        };
      }
      if (table === "provider_leads") {
        return { select: vi.fn(() => chain) };
      }
      if (table === "provider_lead_activities") {
        return { insert: activityInsert };
      }
      return {};
    });

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        callId: "bbbb1111-2222-3333-4444-555566667777",
        formattedNumber: "+27111222333",
        answered: true,
        inbound: false,
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deduped).toBe(true);
    // No duplicate activity is written when the comms insert was deduped.
    expect(activityInsert).not.toHaveBeenCalled();
  });
});
