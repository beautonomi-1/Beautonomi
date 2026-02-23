/**
 * Admin feature-flags API tests: response shape { data, error }, auth, validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createMockNextRequest,
  createMockSupabaseClient,
  MOCK_USERS,
} from "@/__tests__/helpers/mock-supabase";

const mockRequireRole = vi.fn();
vi.mock("@/lib/supabase/auth-server", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockGetSupabaseServer = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

describe("GET /api/admin/feature-flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    const mockSupabase = createMockSupabaseClient();
    const thenable = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then(resolve: (v: { data: unknown[]; error: null }) => void) {
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    mockSupabase.from.mockReturnValue(thenable);
    mockGetSupabaseServer.mockResolvedValue(mockSupabase);
  });

  it("returns 200 with { data: array, error: null } when superadmin", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/feature-flags");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.error).toBeNull();
  });

  it("returns 403 when requireRole throws", async () => {
    mockRequireRole.mockRejectedValue(new Error("Insufficient permissions"));
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
    mockRequireRole.mockResolvedValue({
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
    mockGetSupabaseServer.mockResolvedValue(mockSupabase);
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
