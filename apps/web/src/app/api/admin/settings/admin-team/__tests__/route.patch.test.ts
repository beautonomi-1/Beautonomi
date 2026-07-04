/**
 * PATCH /api/admin/settings/admin-team/[id] — role updates, self-guards, single body parse.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

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

const TARGET_ID = "admin-0000-0000-0000-000000000099";

function buildSupabase(target: Record<string, unknown>) {
  const updatePayload = vi.fn();
  const from = vi.fn((table: string) => {
    if (table !== "users") return {};
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: target, error: null }),
      update: vi.fn((payload: Record<string, unknown>) => {
        updatePayload(payload);
        return {
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    };
  });
  return { from, updatePayload };
}

describe("PATCH /api/admin/settings/admin-team/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
  });

  it("allows superadmin to update their own full_name", async () => {
    const { from, updatePayload } = buildSupabase({
      id: MOCK_USERS.superadmin.id,
      role: "superadmin",
      email: MOCK_USERS.superadmin.email,
      full_name: "Old Name",
    });
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { PATCH } = await import("../[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/settings/admin-team/${MOCK_USERS.superadmin.id}`, {
      method: "PATCH",
      body: JSON.stringify({ full_name: "New Name" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: MOCK_USERS.superadmin.id }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(updatePayload).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: "New Name" })
    );
  });

  it("rejects self-deactivation", async () => {
    const { from, updatePayload } = buildSupabase({
      id: MOCK_USERS.superadmin.id,
      role: "superadmin",
      email: MOCK_USERS.superadmin.email,
      full_name: MOCK_USERS.superadmin.full_name,
    });
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { PATCH } = await import("../[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/settings/admin-team/${MOCK_USERS.superadmin.id}`, {
      method: "PATCH",
      body: JSON.stringify({ deactivated_at: new Date().toISOString() }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: MOCK_USERS.superadmin.id }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("SELF_DEACTIVATE");
    expect(updatePayload).not.toHaveBeenCalled();
  });

  it("rejects self-demotion from superadmin", async () => {
    const { from, updatePayload } = buildSupabase({
      id: MOCK_USERS.superadmin.id,
      role: "superadmin",
      email: MOCK_USERS.superadmin.email,
      full_name: MOCK_USERS.superadmin.full_name,
    });
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { PATCH } = await import("../[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/settings/admin-team/${MOCK_USERS.superadmin.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: "admin_support" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: MOCK_USERS.superadmin.id }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("SELF_DEMOTE");
    expect(updatePayload).not.toHaveBeenCalled();
  });

  it("updates another admin member role", async () => {
    const { from, updatePayload } = buildSupabase({
      id: TARGET_ID,
      role: "admin_support",
      email: "support@example.com",
      full_name: "Support Admin",
    });
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { PATCH } = await import("../[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/settings/admin-team/${TARGET_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ role: "admin_finance" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: TARGET_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(updatePayload).toHaveBeenCalledWith(
      expect.objectContaining({ role: "admin_finance" })
    );
  });
});
