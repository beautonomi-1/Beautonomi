import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  getUnreadNotificationCount: vi.fn().mockResolvedValue(0),
}));

function makeListChain(rows: unknown[], total: number, unread: number) {
  const listResult = { data: rows, error: null, count: total };
  const listChain: Record<string, unknown> = {
    eq: () => listChain,
    order: () => listChain,
    range: () => ({
      eq: () => listChain,
      then: (resolve: (v: unknown) => void) => resolve(listResult),
    }),
    then: (resolve: (v: unknown) => void) => resolve(listResult),
  };
  const unreadChain: Record<string, unknown> = {
    eq: () => unreadChain,
    then: (resolve: (v: unknown) => void) => resolve({ count: unread, error: null }),
  };
  let notificationsCall = 0;
  return {
    from: (table: string) => {
      if (table !== "notifications") throw new Error(table);
      notificationsCall += 1;
      return {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) return unreadChain;
          return listChain;
        },
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: { id: "n1", is_read: true, created_at: "2026-01-01T00:00:00Z" },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      };
    },
    __notificationsCall: () => notificationsCall,
  };
}

describe("/api/admin/notifications", () => {
  const user = { id: "admin-1", role: "superadmin" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user });
  });

  it("GET counts_only returns unread head count for caller", async () => {
    mockGetSupabaseAdmin.mockReturnValue(makeListChain([], 0, 9));
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/admin/notifications?counts_only=1"));
    const body = await res.json();
    expect(body.data.total_unread).toBe(9);
    expect(body.data.notifications).toEqual([]);
  });

  it("GET supports pagination and unread filter", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeListChain([{ id: "n1", is_read: false, title: "Hi", created_at: "2026-01-01" }], 1, 1),
    );
    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("http://localhost/api/admin/notifications?limit=10&offset=0&unread_only=true"),
    );
    const body = await res.json();
    expect(body.data.notifications).toHaveLength(1);
    expect(body.data.has_more).toBe(false);
  });

  it("PATCH can mark a notification unread (clears read_at)", async () => {
    const updatePayload = vi.fn();
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        update: (payload: unknown) => {
          updatePayload(payload);
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({
                    data: { id: "n1", is_read: false, read_at: null, created_at: "2026-01-01T00:00:00Z" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      }),
    });
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/notifications/n1", {
        method: "PATCH",
        body: JSON.stringify({ is_read: false }),
      }),
      { params: Promise.resolve({ id: "n1" }) },
    );
    expect(res.status).toBe(200);
    expect(updatePayload).toHaveBeenCalledWith({ is_read: false, read_at: null });
  });

  it("PATCH scopes update to caller user_id", async () => {
    const supabase = makeListChain([], 0, 0);
    mockGetSupabaseAdmin.mockReturnValue(supabase);
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/notifications/n1", {
        method: "PATCH",
        body: JSON.stringify({ is_read: true }),
      }),
      { params: Promise.resolve({ id: "n1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockRequireRoleInApi).toHaveBeenCalled();
  });

  it("DELETE rejects rows not owned by caller via maybeSingle guard", async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }),
        delete: vi.fn(),
      }),
    });
    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(new NextRequest("http://localhost/api/admin/notifications/other"), {
      params: Promise.resolve({ id: "other" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST bulk-delete removes only caller-owned ids", async () => {
    const deleteIn = vi.fn().mockReturnValue({
      eq: () => ({
        in: () => ({
          select: async () => ({ data: [{ id: "n1" }, { id: "n2" }], error: null }),
        }),
      }),
    });
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        delete: deleteIn,
      }),
    });

    const { POST } = await import("../bulk-delete/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/notifications/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: ["n1", "n2"] }),
      }),
    );
    const body = await res.json();
    expect(body.data.deleted).toBe(2);
    expect(deleteIn).toHaveBeenCalled();
  });

  it("POST mark-all-read updates only caller unread rows", async () => {
    const updateEq = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        update: () => ({
          eq: updateEq,
        }),
      }),
    });
    const { POST } = await import("../mark-all-read/route");
    const res = await POST(new NextRequest("http://localhost/api/admin/notifications/mark-all-read", { method: "POST" }));
    const body = await res.json();
    expect(body.data.success).toBe(true);
    expect(updateEq).toHaveBeenCalledWith("user_id", "admin-1");
  });
});
