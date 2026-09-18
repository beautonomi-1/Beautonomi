import { describe, expect, it, vi } from "vitest";
import {
  providerHasEntitledAppleSubscriptionInLog,
  resyncProviderSubscriptionFromAppleLog,
} from "@/lib/iap/apple/resync-subscription-from-log";

vi.mock("@/lib/iap/apple/entitlement-bridge", () => ({
  processAppleSignedTransaction: vi.fn(async () => ({
    ok: true,
    transactionId: "tx-1",
    productId: "com.beautonomi.partner.sub.growth.monthly",
    kind: "subscription",
    providerId: "p1",
  })),
}));

describe("resync-subscription-from-log", () => {
  it("detects entitled subscription rows", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [{ expires_date: future, revocation_date: null }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never;

    expect(await providerHasEntitledAppleSubscriptionInLog(supabase, "p1")).toBe(true);
  });

  it("resync applies latest entitled JWS", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              not: () => ({
                is: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: [
                        {
                          raw_jws: "aaa.bbb.ccc",
                          expires_date: future,
                          grace_period_expires_date: null,
                          revocation_date: null,
                          product_id: "com.beautonomi.partner.sub.growth.monthly",
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never;

    const result = await resyncProviderSubscriptionFromAppleLog(supabase, "p1");
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);
  });
});
