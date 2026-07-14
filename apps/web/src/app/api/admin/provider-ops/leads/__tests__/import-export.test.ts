import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAdminSection = vi.fn();
const mockResolveTenant = vi.fn();
const mockCheckExportRateLimit = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: (...args: unknown[]) => mockRequireAdminSection(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) => mockResolveTenant(...args),
}));

vi.mock("@/lib/rate-limit/admin-export", () => ({
  checkAdminExportRateLimit: (...args: unknown[]) => mockCheckExportRateLimit(...args),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
  extractRequestMeta: vi.fn(() => ({ ip_address: null, user_agent: null })),
}));

describe("provider leads import/export routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireAdminSection.mockResolvedValue({
      user: { id: "admin-1", role: "admin_operations", full_name: "Admin", email: "admin@test.com" },
    });
    mockResolveTenant.mockResolvedValue("tenant-1");
    mockCheckExportRateLimit.mockResolvedValue({ allowed: true, retryAfter: null });
  });

  it("POST import skips duplicates against existing leads", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const inserted: unknown[] = [];

    const mockFrom = vi.fn((table: string) => {
      if (table === "global_service_categories") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: [{ id: "cat-hair", name: "Hair", slug: "hair" }], error: null }),
          })),
        };
      }
      if (table === "provider_leads") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                or: vi.fn(async (clause: string) => {
                  if (clause.includes("exists@test.com")) {
                    return {
                      data: [{
                        id: "lead-existing",
                        email: "Exists@Test.com",
                        phone_e164: null,
                        business_name: "Existing Co",
                        lead_name: "Existing Co",
                        contact_person_name: null,
                      }],
                      error: null,
                    };
                  }
                  return { data: [], error: null };
                }),
                in: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
          insert: vi.fn((rows: unknown) => {
            inserted.push(...(Array.isArray(rows) ? rows : [rows]));
            return {
              select: vi.fn().mockResolvedValue({
                data: [{ id: "lead-new" }],
                error: null,
              }),
            };
          }),
        };
      }
      if (table === "provider_lead_categories") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "provider_lead_activities") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: mockFrom,
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as never);

    const { POST } = await import("../import/route");
    const csv = [
      "name,email",
      "New Lead,new@test.com",
      "Dup Lead,exists@test.com",
    ].join("\n");
    const req = new NextRequest("http://localhost/api/admin/provider-ops/leads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv_content: csv }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.imported).toBe(1);
    expect(body.data.skipped_duplicates_count).toBe(1);
    expect(body.data.skipped_duplicates[0].existing_lead_id).toBe("lead-existing");
    expect(inserted).toHaveLength(1);
    expect((inserted[0] as { email: string }).email).toBe("new@test.com");
  });

  it("GET export applies assigned_to filter and paginates results", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const eqCalls: Array<[string, string]> = [];
    const isCalls: Array<[string, null]> = [];
    const rangeCalls: Array<[number, number]> = [];

    const leadPage = (from: number) =>
      Array.from({ length: from === 0 ? 1000 : 250 }, (_, i) => ({
        id: `lead-${from + i}`,
        business_name: `Biz ${from + i}`,
        contact_person_name: null,
        email: `lead${from + i}@test.com`,
        phone_country_code: "+27",
        phone_national: "111111111",
        phone_e164: `+27111${from + i}`,
        suggested_location_text: "JHB",
        country: "South Africa",
        location_confidence: "low",
        commercial_stage: "new",
        source: "import",
        source_detail: null,
        description: null,
        notes: null,
        tags: [],
        assigned_to: "user-1",
        assigned_user: { full_name: "Assignee One", email: "assignee@test.com" },
        matched_provider_id: null,
        matched_user_id: null,
        match_confidence: null,
        lost_reason: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        provider_lead_categories: [],
      }));

    const mockFrom = vi.fn((table: string) => {
      if (table !== "provider_leads") throw new Error(`Unexpected table ${table}`);
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((col: string, val: string) => {
          eqCalls.push([col, val]);
          return chain;
        }),
        is: vi.fn((col: string, val: null) => {
          isCalls.push([col, val]);
          return chain;
        }),
        in: vi.fn(() => chain),
        or: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn((from: number, to: number) => {
          rangeCalls.push([from, to]);
          const data = leadPage(from).slice(0, to - from + 1);
          return Promise.resolve({ data, error: null });
        }),
      };
      return chain;
    });

    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: mockFrom } as never);

    const { GET } = await import("../export/route");
    const req = new NextRequest(
      "http://localhost/api/admin/provider-ops/leads/export?assigned_to=user-1",
    );
    const res = await GET(req);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(text.startsWith("\uFEFF") || text.startsWith("ID,")).toBe(true);
    expect(eqCalls).toContainEqual(["assigned_to", "user-1"]);
    expect(rangeCalls.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain("Assignee One");
    expect(text.split("\n").length).toBeGreaterThan(1200);
  });

  it("GET export applies unassigned filter", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const isCalls: Array<[string, null]> = [];

    const mockFrom = vi.fn(() => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn((col: string, val: null) => {
          isCalls.push([col, val]);
          return chain;
        }),
        in: vi.fn(() => chain),
        or: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data: [], error: null })),
      };
      return chain;
    });

    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: mockFrom } as never);

    const { GET } = await import("../export/route");
    const req = new NextRequest(
      "http://localhost/api/admin/provider-ops/leads/export?assigned_to=unassigned",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(isCalls).toContainEqual(["assigned_to", null]);
  });
});
