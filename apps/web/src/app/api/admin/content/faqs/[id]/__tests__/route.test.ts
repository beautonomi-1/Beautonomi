/**
 * Admin FAQs PUT contract tests.
 *
 * Confirms that:
 *   - the API accepts `order` and `is_active` and maps `order -> display_order`
 *     (regression: prior PUT passed raw Zod fields to Supabase, dropping the
 *     order change because the column is `display_order`).
 *   - the API rejects empty bodies with 400 instead of clobbering the row.
 *   - GET surfaces `order` on the response shape so the admin SPA can read it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const mockRequireAdminSection = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: (...args: unknown[]) => mockRequireAdminSection(...args),
  };
});

const mockGetSupabaseServer = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

const mockResolveAdminApiTenantId = vi.fn();
vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) => mockResolveAdminApiTenantId(...args),
}));

vi.mock("@/lib/audit/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

function makeRequest(body: unknown, method: "GET" | "PUT" = "PUT") {
  return {
    method,
    url: "http://localhost/api/admin/content/faqs/faq-1",
    headers: { get: () => null, has: () => false, entries: () => new Map().entries(), forEach: () => undefined },
    json: vi.fn().mockResolvedValue(body),
  } as any;
}

describe("/api/admin/content/faqs/[id] PUT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminSection.mockResolvedValue({
      user: { id: MOCK_USERS.superadmin.id, role: MOCK_USERS.superadmin.role },
    });
    mockResolveAdminApiTenantId.mockResolvedValue("tenant-za");
  });

  it("maps `order` to `display_order` when updating", async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "faq-1", display_order: 7, is_active: true, question: "Q?", answer: "A." },
              error: null,
            }),
          }),
        }),
      }),
    });
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => ({ update: updateSpy })),
    });

    const { PUT } = await import("../route");
    const res = await PUT(makeRequest({ order: 7, is_active: true }), {
      params: Promise.resolve({ id: "faq-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({ is_active: true, display_order: 7 });
    expect(body.data.order).toBe(7);
    expect(body.data.is_active).toBe(true);
  });

  it("rejects PUT with an empty payload (no field clobber)", async () => {
    const updateSpy = vi.fn();
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => ({ update: updateSpy })),
    });

    const { PUT } = await import("../route");
    const res = await PUT(makeRequest({}), { params: Promise.resolve({ id: "faq-1" }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("GET returns `order` derived from `display_order`", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "faq-1", display_order: 3, is_active: true, question: "Q?", answer: "A." },
                error: null,
              }),
            }),
          }),
        }),
      })),
    });

    const { GET } = await import("../route");
    const res = await GET(makeRequest({}, "GET"), { params: Promise.resolve({ id: "faq-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.order).toBe(3);
    expect(body.data.display_order).toBe(3);
  });
});
