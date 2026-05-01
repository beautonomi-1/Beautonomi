import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveBroadcastCustomerUserIds,
  resolveBroadcastProviderUserIds,
  isMissingColumnError,
} from "../broadcast-recipient-resolution";

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    rpc: rpcMock,
  }),
}));

describe("isMissingColumnError", () => {
  it("detects Postgres undefined_column", () => {
    expect(
      isMissingColumnError(
        { code: "42703", message: 'column "preferred_home_tenant_id" does not exist' },
        "preferred_home_tenant_id",
      ),
    ).toBe(true);
    expect(isMissingColumnError({ code: "42703", message: "other" }, "preferred_home_tenant_id")).toBe(false);
  });
});

describe("resolveBroadcastCustomerUserIds", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("returns tenant-scoped customer ids from admin RPC", async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: "c1" }, { id: "c2" }],
      error: null,
    });
    const r = await resolveBroadcastCustomerUserIds({} as never, "tenant-x");
    expect(r.mode).toBe("tenant_admin_scope");
    expect(r.userIds).toEqual(["c1", "c2"]);
    expect(rpcMock).toHaveBeenCalledWith("admin_customer_ids_in_tenant_scope", {
      p_tenant_id: "tenant-x",
    });
  });

  it("returns empty list when RPC succeeds with no rows", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const r = await resolveBroadcastCustomerUserIds({} as never, "tenant-x");
    expect(r.mode).toBe("tenant_admin_scope");
    expect(r.userIds).toEqual([]);
  });

  it("falls back to preferred_home when RPC fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "rpc unavailable" } });
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq(col: string) {
                if (col === "role") {
                  return {
                    eq() {
                      return Promise.resolve({ data: [{ id: "ph1" }], error: null });
                    },
                  };
                }
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      },
    };

    const r = await resolveBroadcastCustomerUserIds(supabase as never, "tenant-y");
    expect(r.mode).toBe("fallback_preferred_home");
    expect(r.userIds).toEqual(["ph1"]);
  });
});

describe("resolveBroadcastProviderUserIds", () => {
  it("falls back to active providers when tenant scope is empty", async () => {
    let fromCalls = 0;
    const supabase = {
      from() {
        fromCalls++;
        return {
          select() {
            return {
              eq() {
                return {
                  not() {
                    if (fromCalls === 1) {
                      return Promise.resolve({ data: [], error: null });
                    }
                    return Promise.resolve({ data: [{ user_id: "prov-u1" }], error: null });
                  },
                };
              },
            };
          },
        };
      },
    };

    const r = await resolveBroadcastProviderUserIds(supabase as never, "tenant-y");
    expect(r.mode).toBe("fallback_active_providers_empty_tenant");
    expect(r.userIds).toEqual(["prov-u1"]);
  });
});
