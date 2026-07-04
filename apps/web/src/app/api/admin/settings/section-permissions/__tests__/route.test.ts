/**
 * GET/PUT /api/admin/settings/section-permissions — effective roles envelope.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";
import { ADMIN_SECTION_ROLES } from "@/lib/admin-sections";

const mockRequireRoleInApi = vi.fn();
const mockGetEffectiveAdminSectionRoles = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getEffectiveAdminSectionRoles: (...args: unknown[]) => mockGetEffectiveAdminSectionRoles(...args),
  };
});

describe("GET /api/admin/settings/section-permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
    mockGetEffectiveAdminSectionRoles.mockResolvedValue(ADMIN_SECTION_ROLES);
  });

  it("returns effective section roles for any admin", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/settings/section-permissions");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data.sectionRoles).toEqual(ADMIN_SECTION_ROLES);
    expect(mockGetEffectiveAdminSectionRoles).toHaveBeenCalledWith(req);
  });

  it("propagates auth failures", async () => {
    mockRequireRoleInApi.mockRejectedValue(new Error("Authentication required"));
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/settings/section-permissions");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/admin/settings/section-permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
  });

  it("rejects non-superadmin callers", async () => {
    mockRequireRoleInApi.mockRejectedValue(new Error("Insufficient permissions: requires one of superadmin"));
    const { PUT } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/settings/section-permissions", {
      method: "PUT",
      body: JSON.stringify({ sectionRoles: {} }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });
});
