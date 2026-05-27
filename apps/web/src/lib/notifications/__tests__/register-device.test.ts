import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerDevice } from "@/lib/notifications/onesignal";

function mockSupabase(handlers: {
  delete?: ReturnType<typeof vi.fn>;
  upsert?: ReturnType<typeof vi.fn>;
  insert?: ReturnType<typeof vi.fn>;
}) {
  const deleteResult = handlers.delete ?? vi.fn().mockResolvedValue({ error: null });
  const upsertFn = handlers.upsert ?? vi.fn().mockResolvedValue({ error: null });
  const insertFn = handlers.insert ?? vi.fn().mockResolvedValue({ error: null });

  const deleteChain = {
    eq: vi.fn(function (this: unknown, _col: string, _val: string) {
      return {
        neq: deleteResult,
        eq: deleteResult,
      };
    }),
  };

  const chain = {
    delete: vi.fn().mockReturnValue(deleteChain),
    upsert: upsertFn,
    insert: insertFn,
  };

  return {
    from: vi.fn().mockReturnValue(chain),
    chain,
    deleteResult,
  };
}

describe("registerDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts device row for the authenticated user", async () => {
    const supabase = mockSupabase({});
    const result = await registerDevice(
      supabase as never,
      "user-1",
      "sub-abc",
      "ios",
      "provider",
    );

    expect(result.success).toBe(true);
    expect(supabase.chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        onesignal_player_id: "sub-abc",
        app_type: "provider",
        platform: "ios",
      }),
      { onConflict: "onesignal_player_id" },
    );
  });

  it("reassigns player id via delete+insert when upsert fails", async () => {
    const supabase = mockSupabase({
      upsert: vi.fn().mockResolvedValue({ error: { message: "duplicate key" } }),
    });

    const result = await registerDevice(
      supabase as never,
      "user-2",
      "sub-abc",
      "android",
      "provider",
    );

    expect(result.success).toBe(true);
    expect(supabase.chain.insert).toHaveBeenCalled();
  });

  it("rejects empty player id", async () => {
    const supabase = mockSupabase({});
    const result = await registerDevice(supabase as never, "user-1", "  ", "ios", "provider");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Player ID");
  });
});
