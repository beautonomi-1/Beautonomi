import { describe, expect, it } from "vitest";
import {
  authorizationLinkPatch,
  accessEndFromNextCharge,
  capturedRenewalAccess,
  capturedRenewalPeriodEnd,
  checkoutGrantAlreadyApplied,
  checkoutRenewalAccess,
  computePaidPeriodExpiresAt,
  renewalPeriodStartIso,
  openSavedAuthorizationPeriod,
  subscriptionCreateAccessUpdate,
  subscriptionCreatePlanPatch,
  subscriptionDisableApplies,
  subscriptionEnableUpdate,
  nextChargeDateUpdate,
  subscriptionNotRenewUpdate,
  isLivePaystackSubscription,
  paystackActivationFields,
  stripeActivationFields,
  checkoutPaymentOwnsPlan,
  subscriptionActivationFields,
  shouldIgnorePaystackEventForRow,
  paystackCustomerEmailPattern,
  paystackSubscriptionCollectsRenewal,
} from "@/lib/subscriptions/provider-billing-merchant";

describe("provider-billing-merchant", () => {
  it("leaves a Paystack subscription's past-due retries to Paystack invoices", () => {
    expect(paystackSubscriptionCollectsRenewal("paystack", "SUB_1")).toBe(true);
    expect(paystackSubscriptionCollectsRenewal("paystack", "  ")).toBe(false);
    expect(paystackSubscriptionCollectsRenewal("flutterwave", "SUB_1")).toBe(false);
    expect(paystackSubscriptionCollectsRenewal("manual", null)).toBe(false);
    expect(paystackSubscriptionCollectsRenewal("manual", "SUB_1")).toBe(true);
  });

  it("matches a Paystack email with different letter case and literal underscores", () => {
    expect(paystackCustomerEmailPattern("  Owner_Name%@Salon.com  ")).toBe(
      "Owner\\_Name\\%@Salon.com",
    );
  });

  it("shouldIgnorePaystackEventForRow when Apple is entitled", () => {
    expect(
      shouldIgnorePaystackEventForRow({
        billing_provider: "apple",
        status: "active",
      }),
    ).toBe(true);
  });

  it("shouldIgnorePaystackEventForRow when Stripe is merchant of record", () => {
    expect(
      shouldIgnorePaystackEventForRow({
        billing_provider: "stripe",
        status: "active",
      }),
    ).toBe(true);
  });

  it("applies a checkout only when that same processor already bills the plan", () => {
    const flutterwave = { billing_provider: "flutterwave", status: "past_due" };
    const stripe = { billing_provider: "stripe", status: "active" };
    expect(checkoutPaymentOwnsPlan("flutterwave", flutterwave)).toBe(true);
    expect(checkoutPaymentOwnsPlan("stripe", stripe)).toBe(true);
    expect(checkoutPaymentOwnsPlan("paystack", flutterwave)).toBe(false);
    expect(checkoutPaymentOwnsPlan("flutterwave", stripe)).toBe(false);
    expect(checkoutPaymentOwnsPlan("stripe", { billing_provider: "apple", status: "active" })).toBe(
      false,
    );
  });

  it("isLivePaystackSubscription includes past_due", () => {
    expect(
      isLivePaystackSubscription({
        billing_provider: "paystack",
        status: "past_due",
        paystack_subscription_code: "SUB_1",
        plan: { is_free: false },
      }),
    ).toBe(true);
  });

  it("isLivePaystackSubscription treats active Stripe billing like Paystack for IAP block", () => {
    expect(
      isLivePaystackSubscription({
        billing_provider: "stripe",
        status: "active",
        plan: { is_free: false },
      }),
    ).toBe(true);
  });

  it("isLivePaystackSubscription treats Flutterwave past_due like Stripe for IAP block", () => {
    expect(
      isLivePaystackSubscription({
        billing_provider: "flutterwave",
        status: "past_due",
        plan: { is_free: false },
      }),
    ).toBe(true);
  });

  it("paystackActivationFields sets billing_provider", () => {
    expect(paystackActivationFields()).toMatchObject({
      billing_provider: "paystack",
      paystack_sync_pending: false,
    });
  });

  it("stripeActivationFields sets billing_provider stripe", () => {
    expect(stripeActivationFields()).toMatchObject({ billing_provider: "stripe" });
    expect(subscriptionActivationFields("stripe")).toMatchObject({ billing_provider: "stripe" });
    expect(subscriptionActivationFields("paystack")).toMatchObject({ billing_provider: "paystack" });
  });

  it("lands a month-end period on the last day of the next month", () => {
    const monthly = new Date(computePaidPeriodExpiresAt("monthly", new Date(2026, 0, 31, 12)));
    expect(monthly.getFullYear()).toBe(2026);
    expect(monthly.getMonth()).toBe(1);
    expect(monthly.getDate()).toBe(28);

    const leapDay = new Date(computePaidPeriodExpiresAt("yearly", new Date(2024, 1, 29, 12)));
    expect(leapDay.getFullYear()).toBe(2025);
    expect(leapDay.getMonth()).toBe(1);
    expect(leapDay.getDate()).toBe(28);
  });

  it("opens a captured renewal once from the charge", () => {
    const chargedAt = "2026-10-14T08:00:00.000Z";
    const owed = capturedRenewalPeriodEnd("monthly", chargedAt, "2026-10-14T08:00:00.000Z");
    expect(owed).toBe(computePaidPeriodExpiresAt("monthly", new Date(chargedAt)));
    expect(capturedRenewalPeriodEnd("monthly", chargedAt, owed)).toBeNull();
    expect(capturedRenewalPeriodEnd("monthly", "not-a-date", "2026-10-14T08:00:00.000Z")).toBeNull();
  });

  it("extends a captured charge from a term that was still open", () => {
    const now = new Date("2026-11-20T00:00:00.000Z");
    const access = capturedRenewalAccess({
      billingPeriod: "monthly",
      chargedAt: "2026-11-01T00:00:00.000Z",
      currentExpiresAt: "2026-11-14T00:00:00.000Z",
      currentPlanId: "plan-1",
      currentBillingPeriod: "monthly",
      now,
    });
    expect(access?.periodStart).toBe("2026-11-14T00:00:00.000Z");
    expect(access?.expiresAt).toBe(
      computePaidPeriodExpiresAt("monthly", new Date("2026-11-14T00:00:00.000Z")),
    );
  });

  it("leaves a captured charge whose period is already on the row", () => {
    expect(
      capturedRenewalAccess({
        billingPeriod: "monthly",
        chargedAt: "2026-09-01T00:00:00.000Z",
        currentExpiresAt: "2026-11-10T00:00:00.000Z",
        currentPlanId: "plan-1",
        currentBillingPeriod: "monthly",
        now: new Date("2026-11-20T00:00:00.000Z"),
      }),
    ).toBeNull();
  });

  it("adds the next period after a same-plan term that is still open", () => {
    const paidAt = new Date("2026-11-14T12:00:00.000Z");
    const openUntil = "2026-12-01T00:00:00.000Z";
    const access = checkoutRenewalAccess({
      billingPeriod: "monthly",
      paidAt,
      currentPlanId: "plan-1",
      currentBillingPeriod: "monthly",
      currentExpiresAt: openUntil,
      orderPlanId: "plan-1",
      chargePeriodEnd: computePaidPeriodExpiresAt("monthly", paidAt),
    });
    expect(access.periodStart).toBe(new Date(openUntil).toISOString());
    expect(access.expiresAt).toBe(computePaidPeriodExpiresAt("monthly", new Date(openUntil)));
  });

  it("starts a checkout at the charge when the plan or the term has changed", () => {
    const paidAt = new Date("2026-11-14T12:00:00.000Z");
    const chargeEnd = computePaidPeriodExpiresAt("monthly", paidAt);
    const differentPlan = checkoutRenewalAccess({
      billingPeriod: "monthly",
      paidAt,
      currentPlanId: "plan-1",
      currentBillingPeriod: "monthly",
      currentExpiresAt: "2026-12-20T00:00:00.000Z",
      orderPlanId: "plan-2",
      chargePeriodEnd: chargeEnd,
    });
    const endedTerm = checkoutRenewalAccess({
      billingPeriod: "monthly",
      paidAt,
      currentPlanId: "plan-1",
      currentBillingPeriod: "monthly",
      currentExpiresAt: "2026-11-01T00:00:00.000Z",
      orderPlanId: "plan-1",
      chargePeriodEnd: chargeEnd,
    });
    expect(differentPlan).toEqual({ expiresAt: chargeEnd, periodStart: paidAt.toISOString() });
    expect(endedTerm).toEqual({ expiresAt: chargeEnd, periodStart: paidAt.toISOString() });
  });

  it("starts a renewal at the open term when that term ends before the new period", () => {
    const paidAt = "2026-11-14T12:00:00.000Z";
    const openUntil = "2026-12-01T00:00:00.000Z";
    const grantedEnd = "2027-01-01T00:00:00.000Z";
    expect(renewalPeriodStartIso(openUntil, paidAt, grantedEnd)).toBe(
      new Date(openUntil).toISOString(),
    );
    expect(renewalPeriodStartIso("2026-11-01T00:00:00.000Z", paidAt, grantedEnd)).toBe(paidAt);
  });

  it("treats a stored checkout grant as applied only for the same plan and period", () => {
    const grant = {
      alreadyStored: true,
      currentPlanId: "plan-1",
      currentBillingPeriod: "monthly",
      currentExpiresAt: "2027-01-01T00:00:00.000Z",
      orderPlanId: "plan-1",
      billingPeriod: "monthly" as const,
      grantedExpiresAt: "2027-01-01T00:00:00.000Z",
    };
    expect(checkoutGrantAlreadyApplied(grant)).toBe(true);
    expect(checkoutGrantAlreadyApplied({ ...grant, alreadyStored: false })).toBe(false);
    expect(
      checkoutGrantAlreadyApplied({ ...grant, currentExpiresAt: "2026-12-01T00:00:00.000Z" }),
    ).toBe(false);
    expect(checkoutGrantAlreadyApplied({ ...grant, orderPlanId: "plan-2" })).toBe(false);
  });
});

describe("openSavedAuthorizationPeriod", () => {
  function supabaseFor(options: {
    sub?: {
      id: string;
      status: string;
      expires_at: string | null;
      plan_id?: string;
      billing_period?: string;
    } | null;
    chargedAt?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const updates: Array<Record<string, unknown>> = [];
    const supabase = {
      from(table: string) {
        if (table === "provider_subscriptions") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: options.sub ?? null, error: null }),
                  }),
                }),
              }),
            }),
            update: (values: Record<string, unknown>) => ({
              eq: async () => {
                updates.push(values);
                return { error: null };
              },
            }),
          };
        }
        if (table === "payment_transactions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    limit: async () => ({
                      data: options.chargedAt
                        ? [{ created_at: options.chargedAt, metadata: options.metadata ?? null }]
                        : [],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
    return { supabase, updates };
  }

  const base = {
    providerId: "provider-1",
    reference: "auth-ref",
    paymentProvider: "paystack" as const,
    billingPeriod: "monthly" as const,
  };

  it("opens the charge period when the subscription end date was not saved", async () => {
    const chargedAt = "2026-11-14T08:00:00.000Z";
    const { supabase, updates } = supabaseFor({
      sub: { id: "sub-1", status: "pending", expires_at: "2026-10-01T00:00:00.000Z" },
      chargedAt,
    });

    const result = await openSavedAuthorizationPeriod({ ...base, supabase: supabase as never });

    expect(result.status).toBe("opened");
    expect(result.expiresAt).toBe(computePaidPeriodExpiresAt("monthly", new Date(chargedAt)));
    expect(updates[0]?.expires_at).toBe(result.expiresAt);
    expect(updates[0]?.billing_period_end).toBe(result.expiresAt);
    expect(updates[0]?.status).toBe("active");
  });

  it("opens one period from now when the charge period has already ended", async () => {
    const now = new Date("2026-11-14T20:00:00.000Z");
    const { supabase, updates } = supabaseFor({
      sub: { id: "sub-1", status: "pending", expires_at: null },
      chargedAt: "2026-09-01T08:00:00.000Z",
    });

    const result = await openSavedAuthorizationPeriod({
      ...base,
      supabase: supabase as never,
      now,
    });

    expect(result.status).toBe("opened");
    expect(updates[0]?.expires_at).toBe(computePaidPeriodExpiresAt("monthly", now));
    expect(updates[0]?.billing_period_end).toBe(updates[0]?.expires_at);
  });

  it("leaves an open period and a finished charge period as they are", async () => {
    const chargedAt = "2026-10-14T08:00:00.000Z";
    const appliedEnd = computePaidPeriodExpiresAt("monthly", new Date(chargedAt));
    const open = supabaseFor({
      sub: { id: "sub-1", status: "active", expires_at: "2026-12-14T00:00:00.000Z" },
      chargedAt,
    });
    const finished = supabaseFor({
      sub: { id: "sub-1", status: "past_due", expires_at: appliedEnd },
      chargedAt,
    });

    expect((await openSavedAuthorizationPeriod({ ...base, supabase: open.supabase as never })).status).toBe(
      "unchanged",
    );
    expect((await openSavedAuthorizationPeriod({ ...base, supabase: finished.supabase as never })).status).toBe(
      "unchanged",
    );
    expect(open.updates).toEqual([]);
    expect(finished.updates).toEqual([]);
  });

  it("adds the next period after an open term when there is no stored grant", async () => {
    const chargedAt = "2026-11-01T00:00:00.000Z";
    const openUntil = "2026-11-14T00:00:00.000Z";
    const now = new Date("2026-11-20T00:00:00.000Z");
    const { supabase, updates } = supabaseFor({
      sub: {
        id: "sub-1",
        status: "past_due",
        plan_id: "plan-1",
        billing_period: "monthly",
        expires_at: openUntil,
      },
      chargedAt,
    });

    const result = await openSavedAuthorizationPeriod({
      ...base,
      supabase: supabase as never,
      now,
    });

    expect(result.status).toBe("opened");
    expect(result.expiresAt).toBe(computePaidPeriodExpiresAt("monthly", new Date(openUntil)));
    expect(updates[0]?.billing_period_start).toBe(openUntil);
    expect(updates[0]?.billing_period_end).toBe(result.expiresAt);
  });

  it("opens a stored period when the first delivery did not finish", async () => {
    const { supabase, updates } = supabaseFor({
      sub: {
        id: "sub-1",
        status: "active",
        plan_id: "plan-1",
        billing_period: "monthly",
        expires_at: "2026-12-01T00:00:00.000Z",
      },
      chargedAt: "2026-11-14T08:00:00.000Z",
      metadata: {
        plan_id: "plan-1",
        checkout_period_start: "2026-12-01T00:00:00.000Z",
        checkout_period_end: "2027-01-01T00:00:00.000Z",
      },
    });

    const result = await openSavedAuthorizationPeriod({ ...base, supabase: supabase as never });

    expect(result.status).toBe("opened");
    expect(result.expiresAt).toBe("2027-01-01T00:00:00.000Z");
    expect(updates[0]?.billing_period_start).toBe("2026-12-01T00:00:00.000Z");
    expect(updates[0]?.billing_period_end).toBe("2027-01-01T00:00:00.000Z");
  });

  it("leaves a stored period that is already open", async () => {
    const { supabase, updates } = supabaseFor({
      sub: {
        id: "sub-1",
        status: "active",
        plan_id: "plan-1",
        billing_period: "monthly",
        expires_at: "2027-01-01T00:00:00.000Z",
      },
      chargedAt: "2026-11-14T08:00:00.000Z",
      metadata: {
        plan_id: "plan-1",
        checkout_period_start: "2026-12-01T00:00:00.000Z",
        checkout_period_end: "2027-01-01T00:00:00.000Z",
      },
    });

    const result = await openSavedAuthorizationPeriod({ ...base, supabase: supabase as never });

    expect(result.status).toBe("unchanged");
    expect(updates).toEqual([]);
  });
});

describe("authorizationLinkPatch", () => {
  const now = new Date("2026-11-14T08:00:00.000Z");

  it("saves the card and keeps a past-due grace date", () => {
    const pastDue = authorizationLinkPatch({
      planId: "plan-1",
      billingPeriod: "monthly",
      authorizationCode: "AUTH_1",
      customerCode: "CUS_1",
      status: "past_due",
      now,
    });
    expect(pastDue.paystack_authorization_code).toBe("AUTH_1");
    expect(pastDue.plan_id).toBe("plan-1");
    expect(pastDue.updated_at).toBeUndefined();

    expect(
      authorizationLinkPatch({
        planId: "plan-1",
        billingPeriod: "monthly",
        customerCode: "CUS_1",
        status: "active",
        now,
      }).updated_at,
    ).toBe(now.toISOString());
  });
});

describe("accessEndFromNextCharge", () => {
  const now = new Date("2026-11-14T08:00:00.000Z");

  it("uses a next charge date that is still ahead", () => {
    expect(accessEndFromNextCharge("2026-12-14T08:00:00.000Z", "monthly", now)).toBe(
      "2026-12-14T08:00:00.000Z",
    );
  });

  it("opens one period from now when the next charge date has passed", () => {
    expect(accessEndFromNextCharge("2026-02-01", "monthly", now)).toBe(
      computePaidPeriodExpiresAt("monthly", now),
    );
  });
});

describe("subscriptionCreateAccessUpdate", () => {
  it("opens a missing period from the next charge date", () => {
    const access = subscriptionCreateAccessUpdate({
      billingPeriod: "monthly",
      nextPaymentDate: "2026-03-01T00:00:00.000Z",
      createdAt: "2026-02-01T00:00:00.000Z",
      eventStatus: "active",
      now: new Date("2026-02-01T00:00:00.000Z"),
    });

    expect(access.expires_at).toBe("2026-03-01T00:00:00.000Z");
    expect(access.status).toBe("active");
    expect(access.clearPendingUpgrade).toBe(true);
    expect(access.updated_at).toBe("2026-02-01T00:00:00.000Z");
  });

  it("opens a missing period from the subscription start", () => {
    const now = new Date("2026-11-14T08:00:00.000Z");
    const createdAt = "2026-11-01T08:00:00.000Z";
    const access = subscriptionCreateAccessUpdate({
      billingPeriod: "monthly",
      createdAt,
      now,
    });

    expect(access.expires_at).toBe(computePaidPeriodExpiresAt("monthly", new Date(createdAt)));
  });

  it("opens from now when the create period has already ended", () => {
    const now = new Date("2026-11-14T08:00:00.000Z");
    const access = subscriptionCreateAccessUpdate({
      billingPeriod: "monthly",
      nextPaymentDate: "2026-10-01T00:00:00.000Z",
      createdAt: "2026-09-01T00:00:00.000Z",
      now,
    });

    expect(access.expires_at).toBe(computePaidPeriodExpiresAt("monthly", now));
    expect(access.status).toBe("active");
  });

  it("leaves a later end date and a past-due grace date", () => {
    const access = subscriptionCreateAccessUpdate({
      billingPeriod: "monthly",
      nextPaymentDate: "2026-03-01T00:00:00.000Z",
      createdAt: "2026-02-01T00:00:00.000Z",
      currentExpiresAt: "2026-04-01T00:00:00.000Z",
      currentStartedAt: "2026-01-01T00:00:00.000Z",
      currentStatus: "past_due",
      eventStatus: "active",
      now: new Date("2026-03-20T00:00:00.000Z"),
    });

    expect(access.expires_at).toBeUndefined();
    expect(access.status).toBeUndefined();
    expect(access.started_at).toBeUndefined();
    expect(access.updated_at).toBeUndefined();
    expect(access.applyPlan).toBe(false);
    expect(access.clearPendingUpgrade).toBe(false);
  });
});

describe("subscriptionCreatePlanPatch", () => {
  it("writes the plan when the period is new", () => {
    expect(
      subscriptionCreatePlanPatch({
        applyPlan: true,
        planId: "plan-1",
        billingPeriod: "monthly",
        nextPaymentDate: "2026-03-01T00:00:00.000Z",
        authorizationCode: "AUTH_1",
      }),
    ).toEqual({
      plan_id: "plan-1",
      billing_period: "monthly",
      auto_renew: true,
      next_payment_date: "2026-03-01T00:00:00.000Z",
      paystack_authorization_code: "AUTH_1",
    });
  });

  it("leaves the current plan, renewal setting, and card when the period is already applied", () => {
    expect(
      subscriptionCreatePlanPatch({
        applyPlan: false,
        planId: "plan-old",
        billingPeriod: "yearly",
        nextPaymentDate: "2026-03-01T00:00:00.000Z",
        authorizationCode: "AUTH_OLD",
      }),
    ).toEqual({});
  });
});

describe("nextChargeDateUpdate", () => {
  it("keeps a later stored charge date", () => {
    expect(nextChargeDateUpdate("2026-11-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z")).toBeNull();
    expect(nextChargeDateUpdate("not-a-date", "2026-12-01T00:00:00.000Z")).toBeNull();
  });

  it("stores a later charge date", () => {
    expect(nextChargeDateUpdate("2026-12-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z")).toBe(
      "2026-12-01T00:00:00.000Z",
    );
    expect(nextChargeDateUpdate("2026-12-01T00:00:00.000Z", null)).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("subscriptionEnableUpdate", () => {
  const now = new Date("2026-11-14T08:00:00.000Z");

  it("turns renewal on for a later charge date", () => {
    expect(
      subscriptionEnableUpdate({
        nextPaymentDate: "2026-12-01T00:00:00.000Z",
        currentNextPaymentDate: "2026-11-01T00:00:00.000Z",
        currentStatus: "active",
        now,
      }),
    ).toMatchObject({
      status: "active",
      auto_renew: true,
      cancelled_at: null,
      next_payment_date: "2026-12-01T00:00:00.000Z",
      updated_at: now.toISOString(),
    });
  });

  it("leaves a stored charge date, a missing date, and a past-due grace date", () => {
    expect(
      subscriptionEnableUpdate({
        nextPaymentDate: "2026-12-01T00:00:00.000Z",
        currentNextPaymentDate: "2026-12-01T00:00:00.000Z",
        currentStatus: "active",
        now,
      }),
    ).toEqual({});
    expect(
      subscriptionEnableUpdate({
        nextPaymentDate: null,
        currentNextPaymentDate: "2026-12-01T00:00:00.000Z",
        currentStatus: "active",
        now,
      }),
    ).toEqual({});
    const pastDue = subscriptionEnableUpdate({
      nextPaymentDate: "2026-12-01T00:00:00.000Z",
      currentNextPaymentDate: "2026-11-01T00:00:00.000Z",
      currentStatus: "past_due",
      now,
    });
    expect(pastDue.updated_at).toBeUndefined();
    expect(pastDue.past_due_since).toBeNull();
    expect(pastDue.next_payment_date).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("subscriptionNotRenewUpdate", () => {
  const now = new Date("2026-11-14T08:00:00.000Z");

  it("leaves renewal on when the charge date is earlier than the stored date", () => {
    expect(
      subscriptionNotRenewUpdate({
        nextPaymentDate: "2026-11-01T00:00:00.000Z",
        currentNextPaymentDate: "2026-12-01T00:00:00.000Z",
        currentStatus: "active",
        now,
      }),
    ).toEqual({});
    expect(subscriptionDisableApplies({
      nextPaymentDate: "2026-11-01T00:00:00.000Z",
      currentNextPaymentDate: "2026-12-01T00:00:00.000Z",
    })).toBe(false);
  });

  it("stops renewal for the stored charge date and keeps a past-due grace date", () => {
    expect(
      subscriptionNotRenewUpdate({
        nextPaymentDate: "2026-12-01T00:00:00.000Z",
        currentNextPaymentDate: "2026-12-01T00:00:00.000Z",
        currentStatus: "active",
        now,
      }).auto_renew,
    ).toBe(false);
    const pastDue = subscriptionNotRenewUpdate({
      nextPaymentDate: "2026-12-01T00:00:00.000Z",
      currentNextPaymentDate: "2026-12-01T00:00:00.000Z",
      currentStatus: "past_due",
      now,
    });
    expect(pastDue.auto_renew).toBe(false);
    expect(pastDue.updated_at).toBeUndefined();
    expect(subscriptionDisableApplies({ nextPaymentDate: null, currentNextPaymentDate: "2026-12-01T00:00:00.000Z" })).toBe(
      true,
    );
  });
});
