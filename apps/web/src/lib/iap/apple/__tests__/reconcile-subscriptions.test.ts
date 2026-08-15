import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchAppleSubscriptionStatuses = vi.fn();
const processAppleSignedTransaction = vi.fn();
const handleAppleSubscriptionExpired = vi.fn();

vi.mock("../app-store-api", () => ({
  fetchAppleSubscriptionStatuses: (...args: unknown[]) => fetchAppleSubscriptionStatuses(...args),
}));
vi.mock("../entitlement-bridge", () => ({
  processAppleSignedTransaction: (...args: unknown[]) => processAppleSignedTransaction(...args),
  handleAppleSubscriptionExpired: (...args: unknown[]) => handleAppleSubscriptionExpired(...args),
}));
vi.mock("../jws", () => ({
  parseAppleTransactionJws: () => ({ expiresDate: Date.now() + 86_400_000 }),
}));

import { reconcileStaleAppleSubscriptions } from "../reconcile-subscriptions";
import type { AppleIapConfig } from "../config";

const config: AppleIapConfig = {
  issuerId: "iss",
  keyId: "kid",
  privateKeyPem: "pem",
  bundleId: "com.beautonomi.partner",
  commissionRate: 0.15,
  enabled: true,
};

function mockSupabase(rows: Array<{ provider_id: string; apple_original_transaction_id: string }>) {
  let remaining = [...rows];
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => ({
            lt: () => ({
              order: () => ({
                limit: async (n: number) => {
                  const page = remaining.slice(0, n);
                  remaining = remaining.slice(n);
                  return { data: page };
                },
              }),
            }),
          }),
        }),
      }),
      update: () => ({
        eq: async () => ({ data: null, error: null }),
      }),
    }),
  } as never;
}

describe("reconcileStaleAppleSubscriptions", () => {
  beforeEach(() => {
    fetchAppleSubscriptionStatuses.mockReset();
    processAppleSignedTransaction.mockReset();
    handleAppleSubscriptionExpired.mockReset();
    fetchAppleSubscriptionStatuses.mockResolvedValue({
      data: [{ lastTransactions: [{ signedTransactionInfo: "a.b.c" }] }],
    });
    processAppleSignedTransaction.mockResolvedValue({ ok: true });
  });

  it("pages past the first 50 stale Apple subscriptions in one run", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      provider_id: `p-${i}`,
      apple_original_transaction_id: `otid-${i}`,
    }));
    const result = await reconcileStaleAppleSubscriptions({
      supabase: mockSupabase(rows),
      config,
      pageSize: 50,
      maxPerRun: 400,
      staleMs: 1,
      now: new Date("2026-08-15T12:00:00.000Z"),
    });
    expect(result.checked).toBe(80);
    expect(result.reconciled).toBe(80);
    expect(result.hasMore).toBe(false);
  });

  it("stops at maxPerRun and reports hasMore so the next hourly pass continues", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      provider_id: `p-${i}`,
      apple_original_transaction_id: `otid-${i}`,
    }));
    const result = await reconcileStaleAppleSubscriptions({
      supabase: mockSupabase(rows),
      config,
      pageSize: 50,
      maxPerRun: 50,
      staleMs: 1,
      now: new Date("2026-08-15T12:00:00.000Z"),
    });
    expect(result.checked).toBe(50);
    expect(result.hasMore).toBe(true);
  });
});
