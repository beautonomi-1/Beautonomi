import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerDevice } from "@/lib/notifications/onesignal";

type MockHandlers = {
  legacyDelete?: ReturnType<typeof vi.fn>;
  upsert?: ReturnType<typeof vi.fn>;
  clearDelete?: ReturnType<typeof vi.fn>;
  select?: ReturnType<typeof vi.fn>;
};

function mockSupabase(handlers: MockHandlers = {}) {
  const legacyDeleteResult = handlers.legacyDelete ?? vi.fn().mockResolvedValue({ error: null });
  const upsertFn = handlers.upsert ?? vi.fn().mockResolvedValue({ error: null });
  const clearDeleteResult = handlers.clearDelete ?? vi.fn().mockResolvedValue({ error: null });
  const selectMaybeSingle =
    handlers.select ??
    vi.fn().mockResolvedValue({ data: null, error: null });

  const legacyDeleteChain = {
    eq: vi.fn().mockReturnValue({
      is: legacyDeleteResult,
    }),
  };

  const clearDeleteChain = {
    eq: vi.fn().mockReturnValue({
      eq: clearDeleteResult,
    }),
  };

  const selectChain = {
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: selectMaybeSingle,
      }),
    }),
  };

  const chain = {
    delete: vi
      .fn()
      .mockReturnValueOnce(legacyDeleteChain)
      .mockReturnValue(clearDeleteChain),
    upsert: upsertFn,
    select: vi.fn().mockReturnValue(selectChain),
  };

  return {
    from: vi.fn().mockReturnValue(chain),
    chain,
    upsertFn,
    legacyDeleteResult,
    clearDeleteResult,
    selectMaybeSingle,
  };
}

describe("registerDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts a device row on first registration", async () => {
    const supabase = mockSupabase({});
    const result = await registerDevice(
      supabase as never,
      "user-1",
      "sub-abc",
      "ios",
      "provider",
    );

    expect(result.success).toBe(true);
    expect(supabase.upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        onesignal_player_id: "sub-abc",
        app_type: "provider",
        platform: "ios",
      }),
      { onConflict: "onesignal_player_id,app_type" },
    );
  });

  it("clears legacy NULL app_type rows before upsert", async () => {
    const supabase = mockSupabase({});
    await registerDevice(supabase as never, "user-1", "sub-abc", "ios", "customer");

    expect(supabase.legacyDeleteResult).toHaveBeenCalledWith("app_type", null);
  });

  it("retries upsert after unique violation by clearing conflicting row", async () => {
    const upsertFn = vi
      .fn()
      .mockResolvedValueOnce({
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "user_devices_player_app_type_key"',
        },
      })
      .mockResolvedValueOnce({ error: null });

    const supabase = mockSupabase({ upsert: upsertFn });

    const result = await registerDevice(
      supabase as never,
      "user-2",
      "sub-abc",
      "android",
      "provider",
    );

    expect(result.success).toBe(true);
    expect(upsertFn).toHaveBeenCalledTimes(2);
    expect(supabase.clearDeleteResult).toHaveBeenCalled();
  });

  it("returns success when concurrent request already registered the device for this user", async () => {
    const upsertFn = vi.fn().mockResolvedValue({
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "user_devices_player_app_type_key"',
      },
    });

    const supabase = mockSupabase({
      upsert: upsertFn,
      select: vi.fn().mockResolvedValue({ data: { user_id: "user-1" }, error: null }),
    });

    const result = await registerDevice(
      supabase as never,
      "user-1",
      "sub-abc",
      "ios",
      "provider",
    );

    expect(result.success).toBe(true);
    expect(upsertFn).toHaveBeenCalledTimes(2);
  });

  it("returns upsert error when registration fails for another user", async () => {
    const upsertFn = vi.fn().mockResolvedValue({
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "user_devices_player_app_type_key"',
      },
    });

    const supabase = mockSupabase({
      upsert: upsertFn,
      select: vi.fn().mockResolvedValue({ data: { user_id: "other-user" }, error: null }),
    });

    const result = await registerDevice(
      supabase as never,
      "user-1",
      "sub-abc",
      "ios",
      "provider",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("duplicate key");
  });

  it("returns upsert error when upsert fails with non-unique error", async () => {
    const supabase = mockSupabase({
      upsert: vi.fn().mockResolvedValue({ error: { code: "42501", message: "permission denied" } }),
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
