/**
 * Regression: cron "false failure" → later charge.success must repair
 * next_billing_at to the new term (not leave the short retry schedule that
 * would re-charge the customer within 1–3 days).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleChargeSuccess } from "../charge-success";
import type { PaystackEvent, SupabaseClient } from "../shared";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  notifyMembershipActivated: vi.fn(async () => undefined),
}));

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(async () => undefined),
}));

vi.mock("@/lib/payments/resolve-paystack-fee", () => ({
  resolvePaystackFeeMajor: vi.fn(async () => 0),
}));

describe("membership renewal webhook recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("advances next_billing_at and clears past_due when recovering a failed renewal order", async () => {
    const membershipUpserts: Array<Record<string, unknown>> = [];
    const orderUpdates: Array<Record<string, unknown>> = [];
    const paymentInserts: unknown[] = [];

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "membership_orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "order-renew-1",
                    status: "failed",
                    user_id: "user-1",
                    provider_id: "provider-1",
                    plan_id: "plan-1",
                    amount: 100,
                    metadata: { source: "auto_renewal" },
                  },
                  error: null,
                })),
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              orderUpdates.push(values);
              return {
                eq: vi.fn(() => ({
                  in: vi.fn(async () => ({ error: null })),
                })),
              };
            }),
          };
        }
        if (table === "membership_plans") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: "plan-1", provider_id: "provider-1", name: "VIP", description: "perks" },
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "user_memberships") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "um-1",
                      status: "past_due",
                      started_at: "2026-05-01T00:00:00.000Z",
                      expires_at: "2026-06-01T00:00:00.000Z",
                      metadata: {},
                    },
                    error: null,
                  })),
                })),
              })),
            })),
            upsert: vi.fn(async (values: Record<string, unknown>) => {
              membershipUpserts.push(values);
              return { error: null };
            }),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
              })),
            })),
          };
        }
        if (table === "payment_transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
            insert: vi.fn((row: unknown) => {
              paymentInserts.push(row);
              return Promise.resolve({ error: null });
            }),
            delete: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }
        if (table === "finance_transactions") {
          return {
            insert: vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        if (table === "ads_budget_orders" || table === "provider_subscription_orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    } as unknown as SupabaseClient;

    const event = {
      event: "charge.success",
      data: {
        reference: "mem_renew_recover_1",
        amount: 10000,
        fees: 150,
        metadata: {
          membership_order_id: "order-renew-1",
          kind: "membership_renewal",
          source: "auto_renewal",
        },
        customer: { email: "c@example.com" },
        authorization: null,
      },
    } as unknown as PaystackEvent;

    await handleChargeSuccess(event, mockSupabase);

    expect(membershipUpserts.length).toBe(1);
    const upsert = membershipUpserts[0];
    expect(upsert.status).toBe("active");
    expect(upsert.next_billing_at).toBeTruthy();
    expect(upsert.expires_at).toBeTruthy();
    expect(upsert.next_billing_at).toBe(upsert.expires_at);
    expect(upsert.renewal_failure_count).toBe(0);
    expect(upsert.past_due_since).toBeNull();
    expect(orderUpdates.some((u) => u.status === "paid")).toBe(true);
    expect(paymentInserts.length).toBeGreaterThanOrEqual(1);
  });
});
