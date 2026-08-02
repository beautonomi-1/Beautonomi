import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();

function chain(res: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of [
    "select",
    "eq",
    "or",
    "limit",
    "maybeSingle",
    "insert",
    "update",
    "delete",
    "gte",
  ]) {
    c[m] = vi.fn(() => c);
  }
  c.maybeSingle = vi.fn(async () => res);
  c.then = (resolve: (v: unknown) => void) => Promise.resolve(res).then(resolve);
  return c;
}

describe("user-blocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_blocks") {
        return chain({ data: [], error: null });
      }
      return chain({ data: null, error: null });
    });
  });

  it("getBlockedUserIds merges both directions", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_blocks") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string) => {
              if (col === "blocker_id") {
                return Promise.resolve({
                  data: [{ blocked_user_id: "blocked-a" }],
                  error: null,
                });
              }
              return Promise.resolve({
                data: [{ blocker_id: "blocker-b" }],
                error: null,
              });
            }),
          })),
        };
      }
      return chain({ data: null, error: null });
    });

    const supabase = { from: mockFrom } as never;
    const { getBlockedUserIds } = await import("../user-blocks");
    const ids = await getBlockedUserIds("viewer-1", supabase);
    expect(ids.has("blocked-a")).toBe(true);
    expect(ids.has("blocker-b")).toBe(true);
  });

  it("assertNotBlocked throws when a block exists", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { id: "block-1" }, error: null })),
          })),
        })),
      })),
    }));

    const supabase = { from: mockFrom } as never;
    const { assertNotBlocked } = await import("../user-blocks");
    await expect(assertNotBlocked("a", "b", supabase)).rejects.toMatchObject({
      code: "USER_BLOCKED",
    });
  });

  it("filterBlockedAuthors removes blocked user content", async () => {
    const { filterBlockedAuthors } = await import("../user-blocks");
    const blocked = new Set(["user-2"]);
    const out = filterBlockedAuthors(
      [{ user_id: "user-1" }, { user_id: "user-2" }],
      blocked,
    );
    expect(out).toHaveLength(1);
    expect(out[0].user_id).toBe("user-1");
  });

  it("filterBlockedNotificationRecipients excludes blocked peers", async () => {
    const { filterBlockedNotificationRecipients } = await import("../user-blocks");
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_blocks") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string, val: string) => {
              if (col === "blocker_id" && val === "sender") {
                return Promise.resolve({ data: [{ blocked_user_id: "blocked-user" }], error: null });
              }
              if (col === "blocked_user_id" && val === "sender") {
                return Promise.resolve({ data: [], error: null });
              }
              return Promise.resolve({ data: [], error: null });
            }),
          })),
        };
      }
      return chain({ data: null, error: null });
    });
    const supabase = { from: mockFrom } as never;
    const filtered = await filterBlockedNotificationRecipients(
      "sender",
      ["blocked-user", "allowed-user"],
      supabase,
    );
    expect(filtered).toEqual(["allowed-user"]);
  });
});
