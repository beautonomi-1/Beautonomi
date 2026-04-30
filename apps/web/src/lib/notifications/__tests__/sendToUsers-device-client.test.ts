/**
 * Ensures cross-user device lookups use service-role Supabase (admin), not a caller JWT,
 * so behavior matches broadcast / template sends after the admin-session broadcast fix.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: hoisted.getSupabaseAdminMock,
}));

vi.mock("@/lib/platform/secrets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform/secrets")>();
  return {
    ...actual,
    resolveOneSignalCredentials: vi.fn().mockResolvedValue({
      appId: "11111111-1111-1111-1111-111111111111",
      restKey: "test-rest-key",
    }),
  };
});

function mockAdminClient(deviceRows: { onesignal_player_id: string; user_id: string }[]) {
  const result = Promise.resolve({ data: deviceRows, error: null });

  const mockEq = vi.fn().mockReturnValue(result);
  const mockOr = vi.fn().mockReturnValue(result);

  const mockIn = vi.fn().mockImplementation((_col: string, _ids: string[]) => ({
    eq: mockEq,
    or: mockOr,
    // No appType: await stops after .in()
    then: result.then.bind(result),
    catch: result.catch.bind(result),
  }));

  const mockSelect = vi.fn().mockReturnValue({
    in: mockIn,
  });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "user_devices") {
      return { select: mockSelect };
    }
    if (table === "notification_logs") {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { from: mockFrom };
}

describe("sendToUsers device lookup client", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "onesignal-msg-id",
            recipients: 1,
          }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    hoisted.getSupabaseAdminMock.mockReset();
  });

  it("uses getSupabaseAdmin when supabaseClient is omitted (customer app)", async () => {
    const { from: mockFrom } = mockAdminClient([
      { onesignal_player_id: "sub-customer-1", user_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
    ]);
    hoisted.getSupabaseAdminMock.mockReturnValue({ from: mockFrom });

    const { sendToUsers } = await import("@/lib/notifications/onesignal");

    await sendToUsers(
      ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
      {
        title: "T",
        message: "M",
        type: "test",
      },
      ["push"],
      { appType: "customer" },
    );

    expect(hoisted.getSupabaseAdminMock).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith("user_devices");
  });

  it("uses getSupabaseAdmin when supabaseClient is omitted (provider app)", async () => {
    const { from: mockFrom } = mockAdminClient([
      { onesignal_player_id: "sub-provider-1", user_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
    ]);
    hoisted.getSupabaseAdminMock.mockReturnValue({ from: mockFrom });

    const { sendToUsers } = await import("@/lib/notifications/onesignal");

    await sendToUsers(
      ["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
      {
        title: "T",
        message: "M",
        type: "test",
      },
      ["push"],
      { appType: "provider" },
    );

    expect(hoisted.getSupabaseAdminMock).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith("user_devices");
  });

  it("uses passed supabaseClient for user_devices; admin still used for notification_logs", async () => {
    const customFrom = vi.fn().mockImplementation((table: string) => {
      if (table !== "user_devices") throw new Error(table);
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({
              data: [{ onesignal_player_id: "sub-x", user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc" }],
              error: null,
            }),
          }),
        }),
      };
    });

    const adminFrom = vi.fn().mockImplementation((table: string) => {
      if (table === "notification_logs") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      throw new Error(`admin client must not query ${table} for device lookup when supabaseClient override is set`);
    });
    hoisted.getSupabaseAdminMock.mockReturnValue({ from: adminFrom });

    const { sendToUsers } = await import("@/lib/notifications/onesignal");

    await sendToUsers(
      ["cccccccc-cccc-cccc-cccc-cccccccccccc"],
      {
        title: "T",
        message: "M",
        type: "test",
      },
      ["push"],
      {
        appType: "customer",
        supabaseClient: { from: customFrom } as never,
      },
    );

    expect(customFrom).toHaveBeenCalledWith("user_devices");
    expect(adminFrom).toHaveBeenCalledWith("notification_logs");
  });
});
