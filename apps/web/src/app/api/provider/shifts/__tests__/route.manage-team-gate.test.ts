import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "@/__tests__/helpers/mock-supabase";

/**
 * F3-10 — shifts and time-clock mutations for ANOTHER staff member require
 * `manage_team`; acting on your own records stays allowed.
 */

const mockRequireRoleInApi = vi.fn();
const mockIsProviderOwner = vi.fn();
const mockHasPermission = vi.fn();
const dbWrite = vi.fn();
let targetStaffUserId = "other-user-9";

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...a: unknown[]) => mockRequireRoleInApi(...a),
    getProviderIdForUser: vi.fn(async () => "provider-1"),
  };
});
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    isProviderOwner: (...a: unknown[]) => mockIsProviderOwner(...a),
    hasPermission: (...a: unknown[]) => mockHasPermission(...a),
  };
});
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: vi.fn(async () => buildSupabase()) }));

function buildSupabase() {
  return {
    from: vi.fn((table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "order", "limit", "in", "gte", "lte"]) c[m] = vi.fn(() => c);
      for (const m of ["insert", "update", "delete"]) {
        c[m] = vi.fn(() => {
          dbWrite(m);
          return c;
        });
      }
      const row =
        table === "provider_staff"
          ? { id: "staff-target", user_id: targetStaffUserId, name: "Target", time_clock_enabled: true, time_clock_pin: null }
          : table === "staff_shifts"
            ? { id: "11111111-1111-4111-8111-111111111111", staff_id: "staff-target", date: "2026-06-01", start_time: "09:00:00", end_time: "17:00:00" }
            : null;
      c.single = vi.fn(async () => ({ data: row, error: null }));
      c.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      return c;
    }),
  };
}

const SHIFT_ID = "11111111-1111-4111-8111-111111111111";
const STAFF_ID = "22222222-2222-4222-8222-222222222222";
const req = (method: string, body: Record<string, unknown> = {}) =>
  createMockNextRequest({ method, url: "http://localhost:3000/api/provider/shifts", body });

describe("shifts / time-clock require manage_team for other staff (F3-10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    targetStaffUserId = "other-user-9";
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "staff-user-1", role: "provider_staff" } });
    mockIsProviderOwner.mockResolvedValue(false);
    mockHasPermission.mockResolvedValue(false);
  });

  it("POST /shifts for a colleague → 403", async () => {
    const { POST } = await import("../route");
    const res = await POST(req("POST", { staff_id: STAFF_ID, date: "2026-06-01", start_time: "09:00", end_time: "17:00" }));
    expect(res.status).toBe(403);
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("POST /shifts for yourself is allowed", async () => {
    targetStaffUserId = "staff-user-1";
    const { POST } = await import("../route");
    const res = await POST(req("POST", { staff_id: STAFF_ID, date: "2026-06-01", start_time: "09:00", end_time: "17:00" }));
    expect(res.status).not.toBe(403);
    expect(dbWrite).toHaveBeenCalledWith("insert");
  });

  it("PATCH/DELETE /shifts/[id] owned by a colleague → 403", async () => {
    const { PATCH, DELETE } = await import("../[id]/route");
    const p = { params: Promise.resolve({ id: SHIFT_ID }) };
    expect((await PATCH(req("PATCH", { notes: "x" }), p)).status).toBe(403);
    expect((await DELETE(req("DELETE"), p)).status).toBe(403);
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("clock-in / clock-out for a colleague → 403", async () => {
    const { POST: clockIn } = await import("../../staff/[id]/time-clock/clock-in/route");
    const { POST: clockOut } = await import("../../staff/[id]/time-clock/clock-out/route");
    const p = { params: Promise.resolve({ id: "staff-target" }) };
    expect((await clockIn(req("POST", {}), p)).status).toBe(403);
    expect((await clockOut(req("POST", {}), p)).status).toBe(403);
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("POST/PATCH/GET /staff/[id]/time-clock for a colleague → 403", async () => {
    const { POST, PATCH, GET } = await import("../../staff/[id]/time-clock/route");
    const p = { params: Promise.resolve({ id: "staff-target" }) };
    expect((await POST(req("POST", {}), p)).status).toBe(403);
    expect((await PATCH(req("PATCH", {}), p)).status).toBe(403);
    expect((await GET(req("GET"), p)).status).toBe(403);
    const { GET: getCard } = await import("../../staff/[id]/time-clock/[timeCardId]/route");
    expect(
      (
        await getCard(req("GET"), {
          params: Promise.resolve({ id: "staff-target", timeCardId: "card-1" }),
        })
      ).status,
    ).toBe(403);
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("clock-in for yourself is allowed", async () => {
    targetStaffUserId = "staff-user-1";
    const { POST: clockIn } = await import("../../staff/[id]/time-clock/clock-in/route");
    const res = await clockIn(req("POST", {}), { params: Promise.resolve({ id: "staff-target" }) });
    expect(res.status).not.toBe(403);
  });
});
