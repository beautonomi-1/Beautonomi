import { describe, it, expect } from "vitest";
import {
  resolveBroadcastCustomerUserIds,
  resolveBroadcastProviderUserIds,
  isMissingColumnError,
} from "../broadcast-recipient-resolution";

describe("isMissingColumnError", () => {
  it("detects Postgres undefined_column", () => {
    expect(
      isMissingColumnError({ code: "42703", message: 'column "preferred_home_tenant_id" does not exist' }, "preferred_home_tenant_id"),
    ).toBe(true);
    expect(isMissingColumnError({ code: "42703", message: "other" }, "preferred_home_tenant_id")).toBe(false);
  });
});

describe("resolveBroadcastCustomerUserIds", () => {
  it("falls back to all customers when tenant-preferred returns zero rows", async () => {
    let eqCalls = 0;
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                eqCalls++;
                // First query: .eq(role).eq(tenantId) — chained
                if (eqCalls === 1) {
                  return {
                    eq() {
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                }
                // Second query: .eq(role) only
                return Promise.resolve({ data: [{ id: "cust-fallback" }], error: null });
              },
            };
          },
        };
      },
    };

    const r = await resolveBroadcastCustomerUserIds(supabase as never, "tenant-x");
    expect(r.mode).toBe("fallback_all_customers_empty_tenant");
    expect(r.userIds).toEqual(["cust-fallback"]);
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
