import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerDevice } from "@/lib/notifications/onesignal";

type MockHandlers = {
  delete?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  insert?: ReturnType<typeof vi.fn>;
};

function mockSupabase(handlers: MockHandlers = {}) {
  const deleteResult = handlers.delete ?? vi.fn().mockResolvedValue({ error: null });
  const updateFn =
    handlers.update ??
    vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    });
  const insertFn = handlers.insert ?? vi.fn().mockResolvedValue({ error: null });

  const deleteChain = {
    eq: vi.fn(function (this: unknown, _col: string, _val: string) {
      return {
        eq: vi.fn().mockReturnValue({ neq: deleteResult }),
        neq: deleteResult,
      };
    }),
  };

  const chain = {
    delete: vi.fn().mockReturnValue(deleteChain),
    update: updateFn,
    insert: insertFn,
  };

  return {
    from: vi.fn().mockReturnValue(chain),
    chain,
    deleteResult,
    updateFn,
    insertFn,
  };
}

describe("registerDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a new device row when no existing row for the user", async () => {
    const supabase = mockSupabase({});
    const result = await registerDevice(
      supabase as never,
      "user-1",
      "sub-abc",
      "ios",
      "provider",
    );

    expect(result.success).toBe(true);
    expect(supabase.chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        onesignal_player_id: "sub-abc",
        app_type: "provider",
        platform: "ios",
      }),
    );
    expect(supabase.chain.update).toHaveBeenCalled();
  });

  it("updates existing row when user already registered this player id", async () => {
    const supabase = mockSupabase({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: "dev-1" }, error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await registerDevice(
      supabase as never,
      "user-1",
      "sub-abc",
      "ios",
      "provider",
    );

    expect(result.success).toBe(true);
    expect(supabase.chain.insert).not.toHaveBeenCalled();
    expect(supabase.updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "ios" }),
    );
  });

  it("retries insert after unique violation by clearing conflicting row", async () => {
    const insertFn = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key" } })
      .mockResolvedValueOnce({ error: null });

    const supabase = mockSupabase({ insert: insertFn });

    const result = await registerDevice(
      supabase as never,
      "user-2",
      "sub-abc",
      "android",
      "provider",
    );

    expect(result.success).toBe(true);
    expect(insertFn).toHaveBeenCalledTimes(2);
    expect(supabase.chain.delete).toHaveBeenCalledTimes(2);
  });

  it("returns update error when update fails", async () => {
    const supabase = mockSupabase({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: "update failed" },
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await registerDevice(
      supabase as never,
      "user-1",
      "sub-abc",
      "ios",
      "provider",
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("update failed");
  });

  it("returns insert error when insert fails with non-unique error", async () => {
    const supabase = mockSupabase({
      insert: vi.fn().mockResolvedValue({ error: { code: "42501", message: "permission denied" } }),
    });

    const result = await registerDevice(
      supabase as never,
      "user-1",
      "sub-abc",
      "ios",
      "provider",
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("permission denied");
  });

  it("rejects empty player id", async () => {
    const supabase = mockSupabase({});
    const result = await registerDevice(supabase as never, "user-1", "  ", "ios", "provider");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Player ID");
  });
});
