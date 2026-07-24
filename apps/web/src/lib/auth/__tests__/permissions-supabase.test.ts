/**
 * Ensures permission helpers forward the incoming Request to getSupabaseServer
 * so Bearer-token API routes resolve provider ownership under RLS (same JWT as requireRoleInApi).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getStaffPermissions, getAllPermissions, isProviderOwner, normalizeStaffPermissions } from "../permissions";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

import { getSupabaseServer } from "@/lib/supabase/server";

const mockedGetSupabaseServer = vi.mocked(getSupabaseServer);

describe("permissions + Supabase request context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAllPermissions includes ratings keys used by API routes", () => {
    const all = getAllPermissions();
    expect(all.edit_services).toBe(true);
    expect(all.rate_clients).toBe(true);
    expect(all.view_client_ratings).toBe(true);
  });

  it("normalizes legacy provider role permission keys to enforced permissions", () => {
    const normalized = normalizeStaffPermissions({
      view_bookings: true,
      manage_products: true,
      process_sales: true,
      manage_staff: true,
      view_finances: true,
    });

    expect(normalized.view_calendar).toBe(true);
    expect(normalized.edit_products).toBe(true);
    expect(normalized.create_sales).toBe(true);
    expect(normalized.process_payments).toBe(true);
    expect(normalized.manage_team).toBe(true);
    expect(normalized.view_reports).toBe(true);
  });

  it("isProviderOwner forwards Request to getSupabaseServer", async () => {
    const req = new Request("https://example.com/api", {
      headers: { Authorization: "Bearer test-token" },
    });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    mockedGetSupabaseServer.mockResolvedValue({ from } as never);

    await expect(isProviderOwner("user-1", req)).resolves.toBe(true);

    expect(mockedGetSupabaseServer).toHaveBeenCalledWith(req);
    expect(from).toHaveBeenCalledWith("providers");
  });

  it("getStaffPermissions returns full permissions when user owns provider row", async () => {
    const req = new Request("https://example.com/api");
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "prov-1" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    mockedGetSupabaseServer.mockResolvedValue({ from } as never);

    const perms = await getStaffPermissions("owner-user", undefined, req);

    expect(perms.edit_services).toBe(true);
    expect(perms.manage_team).toBe(true);
    expect(mockedGetSupabaseServer).toHaveBeenCalledWith(req);
    expect(from).toHaveBeenCalledWith("providers");
  });

  it("getStaffPermissions gives employee role-aligned defaults when permissions null", async () => {
    const req = new Request("https://example.com/api");
    const providerMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const providerEq = vi.fn().mockReturnValue({ maybeSingle: providerMaybeSingle });
    const providerSelect = vi.fn().mockReturnValue({ eq: providerEq });

    const staffMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        provider_id: "prov-1",
        role: "employee",
        permissions: null,
        role_id: null,
        is_admin: false,
      },
      error: null,
    });
    const staffEq = vi.fn().mockReturnValue({ maybeSingle: staffMaybeSingle });
    const staffSelect = vi.fn().mockReturnValue({ eq: staffEq });
    const from = vi.fn((table: string) => {
      if (table === "providers") return { select: providerSelect };
      if (table === "provider_staff") return { select: staffSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    mockedGetSupabaseServer.mockResolvedValue({ from } as never);

    const perms = await getStaffPermissions("staff-user", undefined, req);

    expect(perms.view_calendar).toBe(true);
    expect(perms.create_appointments).toBe(true);
    expect(perms.manage_team).toBe(false);
    expect(perms.edit_settings).toBe(false);
    expect(perms.process_payments).toBe(true);
    expect(perms.edit_appointments).toBe(true);
    expect(perms.create_sales).toBe(true);
    expect(perms.edit_clients).toBe(true);
    expect(perms.view_team).toBe(true);
  });

  it("getStaffPermissions respects explicit revocations", async () => {
    const req = new Request("https://example.com/api");
    const providerMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const providerEq = vi.fn().mockReturnValue({ maybeSingle: providerMaybeSingle });
    const providerSelect = vi.fn().mockReturnValue({ eq: providerEq });

    const staffMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        provider_id: "prov-1",
        role: "employee",
        permissions: { view_calendar: true, process_payments: false },
        role_id: null,
        is_admin: false,
      },
      error: null,
    });
    const staffEq = vi.fn().mockReturnValue({ maybeSingle: staffMaybeSingle });
    const staffSelect = vi.fn().mockReturnValue({ eq: staffEq });
    const from = vi.fn((table: string) => {
      if (table === "providers") return { select: providerSelect };
      if (table === "provider_staff") return { select: staffSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    mockedGetSupabaseServer.mockResolvedValue({ from } as never);

    const perms = await getStaffPermissions("staff-user", undefined, req);

    expect(perms.view_calendar).toBe(true);
    expect(perms.process_payments).toBeUndefined();
    expect(perms.manage_team).toBeUndefined();
  });

  it("getStaffPermissions normalizes legacy direct staff permissions", async () => {
    const req = new Request("https://example.com/api");
    const providerMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const providerEq = vi.fn().mockReturnValue({ maybeSingle: providerMaybeSingle });
    const providerSelect = vi.fn().mockReturnValue({ eq: providerEq });

    const staffMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        provider_id: "prov-1",
        role: "employee",
        permissions: { view_bookings: true, process_sales: true, manage_staff: true },
        role_id: null,
        is_admin: false,
      },
      error: null,
    });
    const staffEq = vi.fn().mockReturnValue({ maybeSingle: staffMaybeSingle });
    const staffSelect = vi.fn().mockReturnValue({ eq: staffEq });
    const from = vi.fn((table: string) => {
      if (table === "providers") return { select: providerSelect };
      if (table === "provider_staff") return { select: staffSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    mockedGetSupabaseServer.mockResolvedValue({ from } as never);

    const perms = await getStaffPermissions("staff-user", undefined, req);

    expect(perms.view_calendar).toBe(true);
    expect(perms.create_sales).toBe(true);
    expect(perms.process_payments).toBe(true);
    expect(perms.manage_team).toBe(true);
  });

  it("getStaffPermissions treats an empty custom role as explicit denial", async () => {
    const req = new Request("https://example.com/api");
    const providerMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const providerEq = vi.fn().mockReturnValue({ maybeSingle: providerMaybeSingle });
    const providerSelect = vi.fn().mockReturnValue({ eq: providerEq });

    const staffMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        provider_id: "prov-1",
        role: "employee",
        permissions: null,
        role_id: "role-1",
        is_admin: false,
      },
      error: null,
    });
    const staffEq = vi.fn().mockReturnValue({ maybeSingle: staffMaybeSingle });
    const staffSelect = vi.fn().mockReturnValue({ eq: staffEq });

    const roleSingle = vi.fn().mockResolvedValue({ data: { permissions: {} }, error: null });
    const roleEq = vi.fn().mockReturnValue({ single: roleSingle });
    const roleSelect = vi.fn().mockReturnValue({ eq: roleEq });

    const from = vi.fn((table: string) => {
      if (table === "providers") return { select: providerSelect };
      if (table === "provider_staff") return { select: staffSelect };
      if (table === "provider_roles") return { select: roleSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    mockedGetSupabaseServer.mockResolvedValue({ from } as never);

    const perms = await getStaffPermissions("staff-user", undefined, req);

    expect(perms).toEqual({});
  });

  it("getStaffPermissions treats missing custom role rows as denial", async () => {
    const req = new Request("https://example.com/api");
    const providerMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const providerEq = vi.fn().mockReturnValue({ maybeSingle: providerMaybeSingle });
    const providerSelect = vi.fn().mockReturnValue({ eq: providerEq });

    const staffMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        provider_id: "prov-1",
        role: "employee",
        permissions: null,
        role_id: "deleted-role",
        is_admin: false,
      },
      error: null,
    });
    const staffEq = vi.fn().mockReturnValue({ maybeSingle: staffMaybeSingle });
    const staffSelect = vi.fn().mockReturnValue({ eq: staffEq });

    const roleSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const roleEq = vi.fn().mockReturnValue({ single: roleSingle });
    const roleSelect = vi.fn().mockReturnValue({ eq: roleEq });

    const from = vi.fn((table: string) => {
      if (table === "providers") return { select: providerSelect };
      if (table === "provider_staff") return { select: staffSelect };
      if (table === "provider_roles") return { select: roleSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    mockedGetSupabaseServer.mockResolvedValue({ from } as never);

    const perms = await getStaffPermissions("staff-user", undefined, req);

    expect(perms).toEqual({});
  });

  it("getStaffPermissions treats inactive custom roles as denial", async () => {
    const req = new Request("https://example.com/api");
    const providerMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const providerEq = vi.fn().mockReturnValue({ maybeSingle: providerMaybeSingle });
    const providerSelect = vi.fn().mockReturnValue({ eq: providerEq });

    const staffMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        provider_id: "prov-1",
        role: "employee",
        permissions: null,
        role_id: "inactive-role",
        is_admin: false,
      },
      error: null,
    });
    const staffEq = vi.fn().mockReturnValue({ maybeSingle: staffMaybeSingle });
    const staffSelect = vi.fn().mockReturnValue({ eq: staffEq });

    const roleSingle = vi.fn().mockResolvedValue({
      data: { permissions: { manage_team: true }, is_active: false },
      error: null,
    });
    const roleEq = vi.fn().mockReturnValue({ single: roleSingle });
    const roleSelect = vi.fn().mockReturnValue({ eq: roleEq });

    const from = vi.fn((table: string) => {
      if (table === "providers") return { select: providerSelect };
      if (table === "provider_staff") return { select: staffSelect };
      if (table === "provider_roles") return { select: roleSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    mockedGetSupabaseServer.mockResolvedValue({ from } as never);

    const perms = await getStaffPermissions("staff-user", undefined, req);

    expect(perms).toEqual({});
  });

  it("getStaffPermissions treats malformed custom role permissions as denial", async () => {
    const req = new Request("https://example.com/api");
    const providerMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const providerEq = vi.fn().mockReturnValue({ maybeSingle: providerMaybeSingle });
    const providerSelect = vi.fn().mockReturnValue({ eq: providerEq });

    const staffMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        provider_id: "prov-1",
        role: "employee",
        permissions: null,
        role_id: "role-1",
        is_admin: false,
      },
      error: null,
    });
    const staffEq = vi.fn().mockReturnValue({ maybeSingle: staffMaybeSingle });
    const staffSelect = vi.fn().mockReturnValue({ eq: staffEq });

    const roleSingle = vi.fn().mockResolvedValue({ data: { permissions: "{bad json" }, error: null });
    const roleEq = vi.fn().mockReturnValue({ single: roleSingle });
    const roleSelect = vi.fn().mockReturnValue({ eq: roleEq });

    const from = vi.fn((table: string) => {
      if (table === "providers") return { select: providerSelect };
      if (table === "provider_staff") return { select: staffSelect };
      if (table === "provider_roles") return { select: roleSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    mockedGetSupabaseServer.mockResolvedValue({ from } as never);

    const perms = await getStaffPermissions("staff-user", undefined, req);

    expect(perms).toEqual({});
  });
});
