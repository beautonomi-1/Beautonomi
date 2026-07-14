import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockInvalidateCache = vi.fn();
const mockSyncBadge = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/notifications/provider-notifications-list-cache", () => ({
  invalidateProviderNotificationsListCache: (...args: unknown[]) => mockInvalidateCache(...args),
}));

vi.mock("@/lib/notifications/sync-push-badge-count", () => ({
  syncPushBadgeCountAllApps: (...args: unknown[]) => mockSyncBadge(...args),
}));

type UpdateCapture = { payload: Record<string, unknown> | null; filters: Record<string, unknown> };

function makeSupabaseUpdateMock(capture: UpdateCapture) {
  const builder: Record<string, unknown> = {};
  const chain = (filterKey?: string) => {
    const fn = vi.fn((column: string, value: unknown) => {
      capture.filters[column] = value;
      return builder;
    });
    if (filterKey) builder[filterKey] = fn;
    return fn;
  };
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    capture.payload = payload;
    return builder;
  });
  chain("eq");
  builder.then = (resolve: (v: { error: null }) => void) => resolve({ error: null });
  return {
    from: vi.fn(() => builder),
  };
}

describe("PATCH /api/provider/notifications/[id]", () => {
  const capture: UpdateCapture = { payload: null, filters: {} };

  beforeEach(() => {
    vi.clearAllMocks();
    capture.payload = null;
    capture.filters = {};
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockGetSupabaseAdmin.mockReturnValue(makeSupabaseUpdateMock(capture));
  });

  function patchRequest(body: unknown) {
    return new NextRequest("http://localhost/api/provider/notifications/n-1", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  const params = { params: Promise.resolve({ id: "n-1" }) };

  it("marks read: couples read_at with is_read=true", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(patchRequest({ is_read: true }), params);

    expect(response.status).toBe(200);
    expect(capture.payload).toMatchObject({ is_read: true });
    expect(typeof capture.payload?.read_at).toBe("string");
    expect(capture.filters).toMatchObject({ id: "n-1", user_id: "user-1" });
    expect(mockInvalidateCache).toHaveBeenCalledWith("user-1");
  });

  it("marks unread: clears read_at so all surfaces agree the row is unread", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(patchRequest({ is_read: false }), params);

    expect(response.status).toBe(200);
    expect(capture.payload).toEqual({ is_read: false, read_at: null });
  });

  it("rejects payloads without a boolean is_read (no arbitrary column writes)", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(
      patchRequest({ user_id: "someone-else", title: "hacked" }),
      params,
    );

    expect(response.status).toBe(400);
    expect(capture.payload).toBeNull();
  });

  it("ignores extra fields when is_read is present", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(
      patchRequest({ is_read: true, user_id: "someone-else", read_at: "1999-01-01" }),
      params,
    );

    expect(response.status).toBe(200);
    expect(capture.payload).not.toHaveProperty("user_id");
    expect(capture.payload?.read_at).not.toBe("1999-01-01");
  });
});
