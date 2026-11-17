import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "@/__tests__/helpers/mock-supabase";

/**
 * F3-03 / F3-04 — provider mutation routes that previously accepted ANY
 * provider_staff member purely by role (appendix G1-5/G1-6, G3-5/G3-8, G4-8)
 * must now go through the permission model:
 *
 *   edit_services        packages POST, packages/[id] DELETE, addons POST/PUT/DELETE
 *   edit_settings        resource-groups POST/PATCH/DELETE, zone-selections POST/PATCH/DELETE,
 *                        shipping-config PUT, booking-link PATCH, express-booking POST/PATCH/DELETE,
 *                        membership-subscriptions/[id] PATCH + extend, automations POST/PATCH/DELETE,
 *                        customer-visibility PATCH, twilio/email integration test POST
 *   edit_appointments    bookings/[id]/resources POST + [resourceId] DELETE, consent-document POST,
 *                        waitlist/[id]/notify POST, routes/optimize POST
 *   create/edit appts    on-demand/requests/[id] accept + decline
 *   send_messages        custom-requests/[id]/decline POST, custom-offers/upload POST,
 *                        membership-subscriptions/[id]/win-back POST
 *
 * A provider_staff user with no permissions → 403 and no DB write.
 * Owner-only routes (addons, resource-groups) must consult the permission
 * helper instead of hard-coding the owner role.
 */

const mockRequireRoleInApi = vi.fn();
const mockRequirePermission = vi.fn();
const dbWrite = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...a: unknown[]) => mockRequireRoleInApi(...a),
    getProviderIdForUser: vi.fn(async () => "provider-1"),
    userHasProviderAccessAdmin: vi.fn(async () => true),
  };
});
vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
  requireAnyPermission: (...a: unknown[]) => mockRequirePermission(...a),
  requireOwnerOrEditSettings: (...a: unknown[]) => mockRequirePermission(...a),
}));

function writeTrackingClient() {
  const client = {
    from: vi.fn(() => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "in", "is", "neq", "gte", "lte", "not"]) {
        c[m] = vi.fn(() => c);
      }
      for (const m of ["insert", "update", "delete", "upsert"]) {
        c[m] = vi.fn(() => {
          dbWrite(m);
          return c;
        });
      }
      c.single = vi.fn(async () => ({ data: { id: "x", provider_id: "provider-1" }, error: null }));
      c.maybeSingle = c.single;
      c.then = undefined;
      return c;
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(async () => ({ data: null, error: null })) })) },
  };
  return client;
}
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: vi.fn(async () => writeTrackingClient()) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => writeTrackingClient() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => writeTrackingClient() }));
vi.mock("@/lib/bookings/bookings-admin-write", () => ({
  getBookingsAdminClient: () => writeTrackingClient(),
}));
vi.mock("@/lib/supabase/storage-service-client", () => ({
  getStorageServiceClientOrUser: vi.fn(async () => writeTrackingClient()),
}));
vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/subscriptions/feature-access", () => ({
  checkExpressBookingFeatureAccess: vi.fn(async () => ({ enabled: true })),
  checkAutomationFeatureAccess: vi.fn(async () => ({ enabled: true })),
  checkNewGateFeatureAccess: vi.fn(async () => true),
  SUBSCRIPTION_FEATURE_KEYS: { packages: "packages", automations: "automations" },
}));
vi.mock("@/lib/subscriptions/marketing-channel-access", () => ({
  assertAutomationChannelAllowed: vi.fn(async () => null),
}));
vi.mock("@/lib/notifications/onesignal", () => ({
  getNotificationTemplate: vi.fn(async () => null),
  sendTemplateNotification: vi.fn(async () => undefined),
  sendToUser: vi.fn(async () => undefined),
}));
vi.mock("@/lib/notifications/notification-service", () => ({
  notifyMembershipWinBack: vi.fn(async () => undefined),
}));
vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(async () => undefined),
  extractRequestMeta: vi.fn(() => ({})),
}));
vi.mock("@/lib/uploads/custom-request-attachments", () => ({
  uploadCustomRequestAttachments: vi.fn(async () => []),
}));

const p = (id = "x1", extra: Record<string, string> = {}) => ({
  params: Promise.resolve({ id, ...extra }),
});
const req = (method: string, body: Record<string, unknown> = {}) =>
  createMockNextRequest({ method, url: "http://localhost:3000/api/provider/test", body });

const STAFF = { id: "staff-1", role: "provider_staff" };

describe("role-only provider mutations now require permissions (F3-03/F3-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: STAFF });
    mockRequirePermission.mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 }),
    });
  });

  // ---- edit_services -------------------------------------------------------

  it("POST packages → 403 without edit_services", async () => {
    const { POST } = await import("../packages/route");
    const res = await POST(req("POST", { name: "Bundle", price: 100, items: [] }));
    expect(res.status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("edit_services", expect.anything());
    expect(dbWrite).not.toHaveBeenCalled();
  }, 120_000);

  it("DELETE packages/[id] → 403 without edit_services", async () => {
    const { DELETE } = await import("../packages/[id]/route");
    const res = await DELETE(req("DELETE"), p());
    expect(res.status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("edit_services", expect.anything());
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("addons POST/PUT/DELETE use edit_services instead of hard-coded owner role", async () => {
    mockRequirePermission.mockResolvedValue({ authorized: true, user: STAFF });
    const addons = await import("../addons/route");
    const addon = await import("../addons/[id]/route");
    await addons.POST(req("POST", { name: "Gel", price: 50, duration_minutes: 10 }));
    await addon.PUT(req("PUT", { name: "Gel 2" }), p());
    await addon.DELETE(req("DELETE"), p());
    expect(mockRequirePermission).toHaveBeenCalledTimes(3);
    for (const call of mockRequirePermission.mock.calls) expect(call[0]).toBe("edit_services");
    expect(mockRequireRoleInApi).not.toHaveBeenCalledWith(["provider_owner"], expect.anything());
  });

  // ---- edit_settings -------------------------------------------------------

  it("resource-groups POST/PATCH/DELETE use edit_settings instead of hard-coded owner role", async () => {
    mockRequirePermission.mockResolvedValue({ authorized: true, user: STAFF });
    const groups = await import("../resource-groups/route");
    const group = await import("../resource-groups/[id]/route");
    await groups.POST(req("POST", { name: "Rooms" }));
    await group.PATCH(req("PATCH", { name: "Chairs" }), p());
    await group.DELETE(req("DELETE"), p());
    expect(mockRequirePermission).toHaveBeenCalledTimes(3);
    for (const call of mockRequirePermission.mock.calls) expect(call[0]).toBe("edit_settings");
    expect(mockRequireRoleInApi).not.toHaveBeenCalledWith(
      ["provider_owner", "superadmin"],
      expect.anything(),
    );
  });

  it("zone-selections POST/PATCH/DELETE → 403 without edit_settings", async () => {
    const zones = await import("../zone-selections/route");
    const zone = await import("../zone-selections/[id]/route");
    expect((await zones.POST(req("POST", { zone_id: "z1", travel_fee: 50 }))).status).toBe(403);
    expect((await zone.PATCH(req("PATCH", { travel_fee: 99 }), p())).status).toBe(403);
    expect((await zone.DELETE(req("DELETE"), p())).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledTimes(3);
    for (const call of mockRequirePermission.mock.calls) expect(call[0]).toBe("edit_settings");
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("PUT shipping-config → 403 without edit_settings", async () => {
    const { PUT } = await import("../shipping-config/route");
    expect((await PUT(req("PUT", { delivery_fee: 10 }))).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("edit_settings", expect.anything());
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("PATCH booking-link → 403 without edit_settings", async () => {
    const { PATCH } = await import("../booking-link/route");
    expect((await PATCH(req("PATCH", { slug: "new-slug" }))).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("edit_settings", expect.anything());
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("express-booking POST / [id] PATCH+DELETE → 403 without edit_settings", async () => {
    const list = await import("../express-booking/route");
    const one = await import("../express-booking/[id]/route");
    expect((await list.POST(req("POST", { name: "Link" }))).status).toBe(403);
    expect((await one.PATCH(req("PATCH", { name: "Renamed" }), p())).status).toBe(403);
    expect((await one.DELETE(req("DELETE"), p())).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledTimes(3);
    for (const call of mockRequirePermission.mock.calls) expect(call[0]).toBe("edit_settings");
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("membership-subscriptions/[id] PATCH + extend → 403 without edit_settings", async () => {
    const sub = await import("../membership-subscriptions/[id]/route");
    const extend = await import("../membership-subscriptions/[id]/extend/route");
    expect((await sub.PATCH(req("PATCH", { action: "cancel" }), p())).status).toBe(403);
    expect((await extend.POST(req("POST", { days: 30 }), p())).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledTimes(2);
    for (const call of mockRequirePermission.mock.calls) expect(call[0]).toBe("edit_settings");
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("automations POST / [id] PATCH+DELETE → 403 without edit_settings", async () => {
    const list = await import("../automations/route");
    const one = await import("../automations/[id]/route");
    expect((await list.POST(req("POST", { name: "Reminder", trigger: "x" }))).status).toBe(403);
    expect((await one.PATCH(req("PATCH", { is_active: true }), p())).status).toBe(403);
    expect((await one.DELETE(req("DELETE"), p())).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledTimes(3);
    for (const call of mockRequirePermission.mock.calls) expect(call[0]).toBe("edit_settings");
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("PATCH customer-visibility → 403 without edit_settings", async () => {
    const { PATCH } = await import("../customer-visibility/route");
    expect((await PATCH(req("PATCH", { mode: "all" }))).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("edit_settings", expect.anything());
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("twilio/email integration test POST → 403 without edit_settings", async () => {
    const twilio = await import("../twilio-integration/test/route");
    const email = await import("../email-integration/test/route");
    expect((await twilio.POST(req("POST", { to: "+10000000000" }))).status).toBe(403);
    expect((await email.POST(req("POST", { to: "test@example.com" }))).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledTimes(2);
    for (const call of mockRequirePermission.mock.calls) expect(call[0]).toBe("edit_settings");
  });

  // ---- edit_appointments ---------------------------------------------------

  it("bookings/[id]/resources POST + [resourceId] DELETE → 403 without edit_appointments", async () => {
    const list = await import("../bookings/[id]/resources/route");
    const one = await import("../bookings/[id]/resources/[resourceId]/route");
    expect((await list.POST(req("POST", { resource_id: "r1" }), p())).status).toBe(403);
    expect((await one.DELETE(req("DELETE"), p("b1", { resourceId: "r1" }))).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledTimes(2);
    for (const call of mockRequirePermission.mock.calls) expect(call[0]).toBe("edit_appointments");
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("POST bookings/[id]/consent-document → 403 without edit_appointments", async () => {
    const { POST } = await import("../bookings/[id]/consent-document/route");
    expect((await POST(req("POST", {}), p())).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("edit_appointments", expect.anything());
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("POST waitlist/[id]/notify → 403 without edit_appointments", async () => {
    const { POST } = await import("../waitlist/[id]/notify/route");
    expect((await POST(req("POST", {}), p())).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("edit_appointments", expect.anything());
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("POST routes/optimize → 403 without edit_appointments", async () => {
    const { POST } = await import("../routes/optimize/route");
    expect((await POST(req("POST", { date: "2026-01-01" }))).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("edit_appointments", expect.anything());
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("on-demand accept/decline → 403 without create/edit appointments", async () => {
    const accept = await import("../on-demand/requests/[id]/accept/route");
    const decline = await import("../on-demand/requests/[id]/decline/route");
    expect((await accept.POST(req("POST", {}), p())).status).toBe(403);
    expect((await decline.POST(req("POST", {}), p())).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledTimes(2);
    for (const call of mockRequirePermission.mock.calls) {
      expect(call[0]).toEqual(["create_appointments", "edit_appointments"]);
    }
    expect(dbWrite).not.toHaveBeenCalled();
  });

  // ---- send_messages -------------------------------------------------------

  it("custom-requests decline / custom-offers upload / win-back → 403 without send_messages", async () => {
    const decline = await import("../custom-requests/[id]/decline/route");
    const upload = await import("../custom-offers/upload/route");
    const winBack = await import("../membership-subscriptions/[id]/win-back/route");
    expect((await decline.POST(req("POST", { reason: "busy" }), p())).status).toBe(403);
    expect((await upload.POST(req("POST", {}))).status).toBe(403);
    expect((await winBack.POST(req("POST", {}), p())).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledTimes(3);
    for (const call of mockRequirePermission.mock.calls) expect(call[0]).toBe("send_messages");
    expect(dbWrite).not.toHaveBeenCalled();
  });
});
