import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "../helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockFetchList = vi.fn();
const mockFetchById = vi.fn();

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
        error: { message: `${message}: ${error instanceof Error ? error.message : String(error)}` },
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    ),
  errorResponse: (message: string, code?: string, status = 400) =>
    new Response(JSON.stringify({ data: null, error: { message, code } }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  notFoundResponse: (message: string) =>
    new Response(JSON.stringify({ data: null, error: { message, code: "NOT_FOUND" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/compliance/purge-audit-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/compliance/purge-audit-query")>();
  return {
    ...actual,
    fetchCompliancePurgeAuditList: (...args: unknown[]) => mockFetchList(...args),
    fetchCompliancePurgeAuditById: (...args: unknown[]) => mockFetchById(...args),
  };
});

const LIST_URL = "http://localhost:3000/api/admin/compliance/purge-audit";
const ENTRY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("GET /api/admin/compliance/purge-audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
    mockGetSupabaseAdmin.mockReturnValue({});
  });

  it("returns paginated entries with meta (default limit 50 via query helper)", async () => {
    mockFetchList.mockResolvedValue({
      rows: [{ id: ENTRY_ID, created_at: "2026-01-01T00:00:00Z", purge_type: "user" }],
      count: 120,
      error: null,
    });

    const { GET } = await import("@/app/api/admin/compliance/purge-audit/route");
    const res = await GET(
      createMockNextRequest({ method: "GET", url: `${LIST_URL}?page=2&limit=50` }) as NextRequest,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.entries).toHaveLength(1);
    expect(body.data.meta).toEqual({
      page: 2,
      limit: 50,
      total: 120,
      has_more: true,
    });
    expect(mockFetchList).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ offset: 50, limit: 50 }),
    );
  });

  it("returns 400 for invalid purge_type", async () => {
    const { GET } = await import("@/app/api/admin/compliance/purge-audit/route");
    const res = await GET(
      createMockNextRequest({
        method: "GET",
        url: `${LIST_URL}?purge_type=invalid`,
      }) as NextRequest,
    );
    expect(res.status).toBe(400);
    expect(mockFetchList).not.toHaveBeenCalled();
  });

  it("?id= returns entry with report", async () => {
    mockFetchById.mockResolvedValue({
      data: { id: ENTRY_ID, report: { schema_version: 3 }, purge_type: "user" },
      error: null,
    });

    const { GET } = await import("@/app/api/admin/compliance/purge-audit/route");
    const res = await GET(
      createMockNextRequest({
        method: "GET",
        url: `${LIST_URL}?id=${ENTRY_ID}`,
      }) as NextRequest,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.entry?.report).toEqual({ schema_version: 3 });
    expect(mockFetchList).not.toHaveBeenCalled();
  });
});
