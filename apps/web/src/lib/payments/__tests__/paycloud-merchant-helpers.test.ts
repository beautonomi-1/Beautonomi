import { describe, expect, it } from "vitest";
import {
  derivePaycloudMerchantApprovalEnvironment,
  resolveSingleActivePaycloudMerchant,
  resolveTargetPaycloudEnvironment,
} from "@/lib/payments/paycloud-merchant-helpers";

type MerchantRow = { id: string; environment: string; is_active: boolean };
type AppRow = { environment: string; is_enabled: boolean; tenant_id: string | null };

function mockSupabase(options: {
  merchants?: MerchantRow[];
  apps?: AppRow[];
  /** Simulates a client that cannot read admin-owned app rows (RLS or missing chain method). */
  appsUnreadable?: boolean;
}) {
  const merchants = options.merchants ?? [];
  const apps = options.apps ?? [];
  return {
    from(table: string) {
      if (table === "paycloud_merchants") {
        return {
          select: () => ({
            eq: (_col: string, _val: unknown) => ({
              eq: (_c2: string, _v2: unknown) => ({
                eq: (_c3: string, env: string) =>
                  Promise.resolve({
                    data: merchants.filter((m) => m.is_active && m.environment === env),
                    error: null,
                  }),
              }),
              or: () =>
                Promise.resolve({
                  data: merchants.filter((m) => m.is_active),
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "tenant_paycloud_apps") {
        if (options.appsUnreadable) {
          return {
            select: () => ({
              or: () => {
                throw new Error("tenant_paycloud_apps is not readable");
              },
            }),
          };
        }
        return {
          select: () => ({
            or: () => Promise.resolve({ data: apps, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never;
}

describe("resolveTargetPaycloudEnvironment", () => {
  it("prefers live when live app and live merchant exist", async () => {
    const env = await resolveTargetPaycloudEnvironment(
      mockSupabase({
        merchants: [
          { id: "m-s", environment: "sandbox", is_active: true },
          { id: "m-l", environment: "live", is_active: true },
        ],
        apps: [
          { environment: "live", is_enabled: true, tenant_id: "t1" },
          { environment: "sandbox", is_enabled: true, tenant_id: "t1" },
        ],
      }),
      "t1",
    );
    expect(env).toBe("live");
  });

  it("falls back to the merchant environment when app rows are unreadable", async () => {
    const env = await resolveTargetPaycloudEnvironment(
      mockSupabase({
        merchants: [{ id: "m-s", environment: "sandbox", is_active: true }],
        appsUnreadable: true,
      }),
      "t1",
    );
    expect(env).toBe("sandbox");
  });
});

describe("derivePaycloudMerchantApprovalEnvironment", () => {
  it("returns sandbox for a sandbox-only tenant", async () => {
    const env = await derivePaycloudMerchantApprovalEnvironment(
      mockSupabase({ apps: [{ environment: "sandbox", is_enabled: true, tenant_id: "t1" }] }),
      "t1",
    );
    expect(env).toBe("sandbox");
  });

  it("returns live when an enabled live app row exists", async () => {
    const env = await derivePaycloudMerchantApprovalEnvironment(
      mockSupabase({
        apps: [
          { environment: "sandbox", is_enabled: true, tenant_id: "t1" },
          { environment: "live", is_enabled: true, tenant_id: "t1" },
        ],
      }),
      "t1",
    );
    expect(env).toBe("live");
  });

  it("defaults to live rather than throwing when the lookup fails", async () => {
    const env = await derivePaycloudMerchantApprovalEnvironment(
      mockSupabase({ appsUnreadable: true }),
      "t1",
    );
    expect(env).toBe("live");
  });
});

describe("resolveSingleActivePaycloudMerchant", () => {
  it("picks live merchant when both environments exist", async () => {
    const pick = await resolveSingleActivePaycloudMerchant(
      mockSupabase({
        merchants: [
          { id: "sandbox-id", environment: "sandbox", is_active: true },
          { id: "live-id", environment: "live", is_active: true },
        ],
        apps: [
          { environment: "live", is_enabled: true, tenant_id: "t1" },
          { environment: "sandbox", is_enabled: true, tenant_id: "t1" },
        ],
      }),
      "t1",
    );
    expect(pick).toEqual({ id: "live-id" });
  });

  it("reports ambiguous when two live merchants exist", async () => {
    const pick = await resolveSingleActivePaycloudMerchant(
      mockSupabase({
        merchants: [
          { id: "live-1", environment: "live", is_active: true },
          { id: "live-2", environment: "live", is_active: true },
        ],
        apps: [{ environment: "live", is_enabled: true, tenant_id: "t1" }],
      }),
      "t1",
    );
    expect(pick).toEqual({ error: "MERCHANT_AMBIGUOUS", count: 2 });
  });
});
