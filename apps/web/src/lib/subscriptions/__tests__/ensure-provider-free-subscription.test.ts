import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureProviderFreeSubscriptionRow } from "../ensure-provider-free-subscription";

type TableHandlers = Record<string, () => unknown>;

function buildSupabaseStub(tables: TableHandlers, rpcResult?: { data?: unknown; error?: unknown }) {
  const fromFn = vi.fn((table: string) => {
    const handler = tables[table];
    if (!handler) {
      throw new Error(`Unexpected table accessed in stub: ${table}`);
    }
    return handler();
  });
  return {
    from: fromFn,
    rpc: vi.fn(async () => rpcResult ?? { data: "tenant-za-default", error: null }),
  } as unknown as SupabaseClient;
}

describe("ensureProviderFreeSubscriptionRow", () => {
  it("uses the caller-provided free subscription plan id when valid", async () => {
    const inserts: Array<Record<string, unknown>> = [];

    const tables: TableHandlers = {
      provider_subscriptions: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        insert: async (payload: Record<string, unknown>) => {
          inserts.push(payload);
          return { error: null };
        },
      }),
      subscription_plans: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "preferred-free-plan-uuid",
                is_free: true,
                is_active: true,
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    const supabase = buildSupabaseStub(tables);
    const result = await ensureProviderFreeSubscriptionRow(
      supabase,
      "provider-1",
      "tenant-za",
      "preferred-free-plan-uuid",
    );

    expect(result.ok).toBe(true);
    expect(result.planId).toBe("preferred-free-plan-uuid");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.plan_id).toBe("preferred-free-plan-uuid");
    expect(inserts[0]?.provider_id).toBe("provider-1");
    expect(inserts[0]?.tenant_id).toBe("tenant-za");
    expect(inserts[0]?.status).toBe("active");
  });

  it("falls back to the catalog resolver when the preferred plan id is not free/active", async () => {
    const inserts: Array<Record<string, unknown>> = [];

    // State must persist across multiple `.from("subscription_plans")` calls
    // because the implementation calls `from()` once per query (validation,
    // then catalog fallback). The first `select()` resolves the preferred
    // plan (returns a paid row → invalid), and the second resolves the
    // catalog free-active branch.
    let subscriptionPlansSelectCount = 0;
    const subscriptionPlansHandler = () => ({
      select: () => {
        subscriptionPlansSelectCount += 1;
        if (subscriptionPlansSelectCount === 1) {
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "paid-plan-uuid", is_free: false, is_active: true },
                error: null,
              }),
            }),
          };
        }
        return {
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { id: "catalog-free-plan-uuid" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      },
    });

    const tables: TableHandlers = {
      provider_subscriptions: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        insert: async (payload: Record<string, unknown>) => {
          inserts.push(payload);
          return { error: null };
        },
      }),
      subscription_plans: subscriptionPlansHandler,
    };

    const supabase = buildSupabaseStub(tables);
    const result = await ensureProviderFreeSubscriptionRow(
      supabase,
      "provider-2",
      "tenant-za",
      "paid-plan-uuid",
    );

    expect(result.ok).toBe(true);
    expect(result.planId).toBe("catalog-free-plan-uuid");
    expect(inserts[0]?.plan_id).toBe("catalog-free-plan-uuid");
  });

  it("returns early when the provider already has a subscription row", async () => {
    const tables: TableHandlers = {
      provider_subscriptions: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "existing-sub" }, error: null }),
          }),
        }),
        insert: vi.fn(),
      }),
    };

    const supabase = buildSupabaseStub(tables);
    const result = await ensureProviderFreeSubscriptionRow(
      supabase,
      "provider-3",
      "tenant-za",
      "preferred-plan-uuid",
    );

    expect(result).toEqual({ ok: true, skipped: "already_subscribed" });
  });
});
