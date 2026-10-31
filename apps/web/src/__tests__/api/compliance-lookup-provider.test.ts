import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "../helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

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
  notFoundResponse: (message: string) =>
    new Response(JSON.stringify({ data: null, error: { message, code: "NOT_FOUND" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

const PROVIDER_ID = "33333333-3333-4333-8333-333333333333";

describe("GET /api/admin/compliance/lookup-provider/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
  });

  it("returns billing_email without tenant query param", async () => {
    const providerMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: PROVIDER_ID,
        email: "biz@example.com",
        billing_email: "billing@example.com",
        user_id: "44444444-4444-4444-8444-444444444444",
        tenant_id: "11111111-1111-4111-8111-111111111111",
        business_name: "Salon",
      },
      error: null,
    });
    const ownerMaybeSingle = vi.fn().mockResolvedValue({
      data: { email: "owner@example.com" },
      error: null,
    });
    const eq = vi
      .fn()
      .mockImplementationOnce(() => ({ maybeSingle: providerMaybeSingle }))
      .mockImplementationOnce(() => ({ maybeSingle: ownerMaybeSingle }));
    const select = vi.fn().mockReturnValue({ eq });
    mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) });

    const { GET } = await import("@/app/api/admin/compliance/lookup-provider/[id]/route");
    const res = await GET(
      createMockNextRequest({
        method: "GET",
        url: `http://localhost:3000/api/admin/compliance/lookup-provider/${PROVIDER_ID}`,
      }) as NextRequest,
      { params: Promise.resolve({ id: PROVIDER_ID }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.billing_email).toBe("billing@example.com");
    expect(body.data.email).toBe("biz@example.com");
  });
});
