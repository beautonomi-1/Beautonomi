/**
 * Ensures permission helpers use the service role for provider/staff lookups
 * (authenticated column grant) while still forwarding Request to getSupabaseServer
 * for RLS-scoped tables such as provider_roles.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getStaffPermissions, getAllPermissions, isProviderOwner, normalizeStaffPermissions } from "../permissions";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const mockedGetSupabaseServer = vi.mocked(getSupabaseServer);
const mockedGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);

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

  it("edit_settings implies manage_finance for billing hub access", () => {
    const normalized = normalizeStaffPermissions({ edit_settings: true });
    expect(normalized.edit_settings).toBe(true);
    expect(normalized.manage_finance).toBe(true);
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

  it("isProviderOwner uses getSupabaseAdmin for provider ownership lookup", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    mockedGetSupabaseAdmin.mockReturnValue({ from } as never);

    await expect(isProviderOwner("user-1")).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith("providers");
    expect(mockedGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("getStaffPermissions returns full permissions when user owns provider row", async () => {
    const req = new Request("https://example.com/api");
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "prov-1" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    mockedGetSupabaseAdmin.mockReturnValue({ from } as never);
    mockedGetSupabaseServer.mockResolvedValue({ from: vi.fn() } as never);

    const perms = await getStaffPermissions("owner-user", undefined, req);

    expect(perms.edit_services).toBe(true);
    expect(perms.manage_team).toBe(true);
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
    const adminFrom = vi.fn((table: string) => {
      if (table === "providers") return { select: providerSelect };
      if (table === "provider_staff") return { select: staffSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    mockedGetSupabaseAdmin.mockReturnValue({ from: adminFrom } as never);

  const rolesMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const rolesEq = vi.fn().mockReturnValue({ maybeSingle: rolesMaybeSingle });
    const rolesSelect = vi.fn().mockReturnValue({ eq: rolesEq });
    mockedGetSupabaseServer.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "provider_roles") return { select: rolesSelect };
        throw new Error(`Unexpected server table ${table}`);
      }),
    } as never);

    const perms = await getStaffPermissions("staff-user", undefined, req);

    expect(perms.view_calendar).toBe(true);
    expect(perms.calendar_scope).toBe("own");
    expect(perms.edit_appointments).toBe(true);
    expect(perms.view_own_earnings).toBe(true);
    expect(perms.create_appointments).toBe(false);
    expect(perms.cancel_appointments).toBe(false);
    expect(perms.process_payments).toBe(false);
    expect(perms.create_sales).toBe(false);
    expect(perms.view_team).toBe(false);
  });
});