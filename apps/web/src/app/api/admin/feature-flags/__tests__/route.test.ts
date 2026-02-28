/**
 * Admin feature-flags API tests: response shape { data, error }, auth, validation.
 * Route uses requireRoleInApi (api-helpers) and getSupabaseAdmin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createMockNextRequest,
  createMockSupabaseClient,
  MOCK_USERS,
} from "@/__tests__/helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

describe("GET /api/admin/feature-flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
    const mockSupabase = createMockSupabaseClient();
    const result = Promise.resolve({ data: [] as unknown[], error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (onFulfilled?: (v: { data: unknown[]; error: null }) => unknown) =>
        result.then(onFulfilled as (v: { data: unknown[]; error: null }) => unknown),
      catch: (onRejected?: (e: unknown) => unknown) => result.catch(onRejected),
    };
    mockSupabase.from.mockReturnValue(chain);
    mockGetSupabaseAdmin.mockReturnValue(mockSupabase);
  });

  it(
    "returns 200 with { data: array, error: null } when superadmin",
    async () => {
      const { GET } = await import("../route");
      const req = new NextRequest("http://localhost/api/admin/feature-flags");
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toHaveProperty("data");
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.error).toBeNull();
    },
    10000
  );

  it("returns 403 when requireRoleInApi throws", async () => {
    mockRequireRoleInApi.mockRejectedValue(new Error("Insufficient permissions"));
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/feature-flags");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body.error).toBeTruthy();
    expect(body.data).toBeNull();
  });
});

describe("POST /api/admin/feature-flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: MOCK_USERS.superadmin.id },
    });
    const mockSupabase = createMockSupabaseClient();
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "flag-1",
          feature_key: "test_flag",
          feature_name: "Test",
          enabled: false,
        },
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(chain);
    mockGetSupabaseAdmin.mockReturnValue(mockSupabase);
  });

  it("returns 400 with { data: null, error } when feature_key missing", async () => {
    const { POST } = await import("../route");
    const req = createMockNextRequest({
      method: "POST",
      url: "http://localhost/api/admin/feature-flags",
      body: { feature_name: "Only name" },
    });
    const res = await POST(req as NextRequest);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.data).toBeNull();
    expect(body.error).toBeTruthy();
    expect(body.error.message).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 201 with { data: flag, error: null } when body valid", async () => {
    const { POST } = await import("../route");
    const req = createMockNextRequest({
      method: "POST",
      url: "http://localhost/api/admin/feature-flags",
      body: {
        feature_key: "new_flag",
        feature_name: "New Flag",
        enabled: false,
      },
    });
    const res = await POST(req as NextRequest);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.error).toBeNull();
    expect(body.data).toBeDefined();
    expect(body.data.feature_key).toBe("test_flag");
  });
});
