/**
 * Regression: cron "false failure" → later charge.success must repair
 * next_billing_at to the new term (not leave the short retry schedule that
 * would re-charge the customer within 1–3 days).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleChargeSuccess } from "../charge-success";
import { renewalPeriodEnd } from "@/lib/memberships/membership-renewal-retry";
import type { PaystackEvent, SupabaseClient } from "../shared";

function membershipFinanceTable() {
  const api = {
    select: () => api,
    eq: () => api,
    contains: () => api,
    in: async () => ({ data: [], error: null }),
    insert: () => Promise.resolve({ error: null }),
  };
  return api;
}

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
    const steps: string[] = [];

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
              steps.push("active");
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
              steps.push("payment");
              return Promise.resolve({ error: null });
            }),
            delete: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }
        if (table === "finance_transactions") {
          return membershipFinanceTable();
        }
        if (table === "ads_budget_orders" || table === "provider_subscription_orders" || table === "wallet_topups") {
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
    const openedFor = new Date(String(upsert.expires_at)).getTime() - Date.now();
    expect(openedFor).toBeGreaterThan(27 * 24 * 60 * 60 * 1000);
    expect(openedFor).toBeLessThan(32 * 24 * 60 * 60 * 1000);
    expect(Math.abs(new Date(String(upsert.started_at)).getTime() - Date.now())).toBeLessThan(60_000);
    expect(upsert.renewal_failure_count).toBe(0);
    expect(upsert.past_due_since).toBeNull();
    expect(orderUpdates.some((u) => u.status === "paid")).toBe(true);
    expect(steps.indexOf("payment")).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf("payment")).toBeLessThan(steps.indexOf("active"));
  });

  it("keeps the remaining days of a past-due membership, including a month-end date", async () => {
    const currentExpiry = "2027-01-31T12:00:00.000Z";
    const membershipUpserts: Array<Record<string, unknown>> = [];

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "membership_orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "order-renew-open",
                    status: "pending",
                    user_id: "user-1",
                    provider_id: "provider-1",
                    plan_id: "plan-1",
                    amount: 100,
                    metadata: { source: "auto_renewal" },
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(async () => ({ error: null })),
              })),
            })),
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
                      expires_at: currentExpiry,
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
            insert: vi.fn(() => Promise.resolve({ error: null })),
            delete: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }
        if (table === "finance_transactions") {
          return membershipFinanceTable();
        }
        if (table === "ads_budget_orders" || table === "provider_subscription_orders" || table === "wallet_topups") {
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

    await handleChargeSuccess(
      {
        event: "charge.success",
        data: {
          reference: "mem_renew_open_1",
          amount: 10000,
          fees: 150,
          metadata: {
            membership_order_id: "order-renew-open",
            kind: "membership_renewal",
            source: "auto_renewal",
          },
          customer: { email: "c@example.com" },
          authorization: null,
        },
      } as unknown as PaystackEvent,
      mockSupabase,
    );

    const expectedEnd = renewalPeriodEnd(currentExpiry, new Date()).toISOString();
    expect(membershipUpserts).toHaveLength(1);
    expect(membershipUpserts[0].expires_at).toBe(expectedEnd);
    expect(membershipUpserts[0].next_billing_at).toBe(expectedEnd);
    expect(membershipUpserts[0].started_at).toBe("2026-05-01T00:00:00.000Z");
    expect(membershipUpserts[0].status).toBe("active");
    expect(membershipUpserts[0].past_due_since).toBeNull();
    expect(new Date(String(membershipUpserts[0].expires_at)).getMonth()).toBe(1);
    expect(new Date(String(membershipUpserts[0].expires_at)).getDate()).toBe(28);
  });

  it("does not add another month when the same membership order is delivered again", async () => {
    const membershipUpserts: Array<Record<string, unknown>> = [];
    const orderUpdates: Array<Record<string, unknown>> = [];

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "membership_orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "order-renew-1",
                    status: "paid",
                    user_id: "user-1",
                    provider_id: "provider-1",
                    plan_id: "plan-1",
                    amount: 100,
                    metadata: { source: "auto_renewal" },
                  },
                  error: null,
                })),
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
                  data: { id: "plan-1", provider_id: "provider-1", name: "VIP" },
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
                      status: "active",
                      started_at: "2026-11-01T00:00:00.000Z",
                      expires_at: "2026-12-14T00:00:00.000Z",
                      metadata: { membership_order_id: "order-renew-1" },
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
          };
        }
        if (table === "payment_transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: "tx-1", status: "success" },
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }
        if (table === "finance_transactions") return membershipFinanceTable();
        if (table === "ads_budget_orders" || table === "provider_subscription_orders" || table === "wallet_topups") {
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

    await handleChargeSuccess(
      {
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
      } as unknown as PaystackEvent,
      mockSupabase,
    );

    expect(membershipUpserts).toHaveLength(0);
    expect(orderUpdates.some((u) => u.status === "paid")).toBe(true);
  });

  it("leaves the renewal unpaid when the month is not saved", async () => {
    const orderUpdates: Array<Record<string, unknown>> = [];

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "membership_orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "order-renew-1",
                    status: "pending",
                    user_id: "user-1",
                    provider_id: "provider-1",
                    plan_id: "plan-1",
                    amount: 100,
                    metadata: { source: "auto_renewal" },
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              orderUpdates.push(values);
              return { eq: vi.fn(() => ({ in: vi.fn(async () => ({ error: null })) })) };
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
                      status: "active",
                      started_at: "2026-05-01T00:00:00.000Z",
                      expires_at: "2026-06-01T00:00:00.000Z",
                      metadata: {},
                    },
                    error: null,
                  })),
                })),
              })),
            })),
            upsert: vi.fn(async () => ({ error: { message: "month down" } })),
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
            insert: vi.fn(() => Promise.resolve({ error: null })),
            delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          };
        }
        if (table === "finance_transactions") return membershipFinanceTable();
        if (table === "ads_budget_orders" || table === "provider_subscription_orders" || table === "wallet_topups") {
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

    await expect(
      handleChargeSuccess(
        {
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
        } as unknown as PaystackEvent,
        mockSupabase,
      ),
    ).rejects.toThrow("membership month was not opened");
    expect(orderUpdates.some((u) => u.status === "paid")).toBe(false);
  });

  it("retries the paid stamp after the month is saved", async () => {
    const orderUpdates: Array<Record<string, unknown>> = [];
    const membershipUpserts: unknown[] = [];
    const charge = {
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

    function supabaseFor(options: { monthOpen: boolean; paidError: boolean }) {
      return {
        from: vi.fn((table: string) => {
          if (table === "membership_orders") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: {
                      id: "order-renew-1",
                      status: "pending",
                      user_id: "user-1",
                      provider_id: "provider-1",
                      plan_id: "plan-1",
                      amount: 100,
                      metadata: { source: "auto_renewal" },
                    },
                    error: null,
                  })),
                })),
              })),
              update: vi.fn((values: Record<string, unknown>) => {
                orderUpdates.push(values);
                return {
                  eq: vi.fn(() => ({
                    in: vi.fn(async () => ({
                      error: options.paidError ? { message: "order down" } : null,
                    })),
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
                        status: "active",
                        started_at: "2026-05-01T00:00:00.000Z",
                        expires_at: "2026-06-01T00:00:00.000Z",
                        metadata: options.monthOpen ? { membership_order_id: "order-renew-1" } : {},
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
              insert: vi.fn(() => Promise.resolve({ error: null })),
              delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            };
          }
          if (table === "finance_transactions") return membershipFinanceTable();
          if (table === "ads_budget_orders" || table === "provider_subscription_orders" || table === "wallet_topups") {
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
    }

    await expect(
      handleChargeSuccess(charge, supabaseFor({ monthOpen: false, paidError: true })),
    ).rejects.toThrow("membership order was not marked paid");
    expect(membershipUpserts).toHaveLength(1);

    membershipUpserts.length = 0;
    orderUpdates.length = 0;
    await expect(
      handleChargeSuccess(charge, supabaseFor({ monthOpen: true, paidError: true })),
    ).rejects.toThrow("membership order was not marked paid");
    expect(membershipUpserts).toHaveLength(0);
    expect(orderUpdates.some((row) => row.status === "paid")).toBe(true);
  });
});
