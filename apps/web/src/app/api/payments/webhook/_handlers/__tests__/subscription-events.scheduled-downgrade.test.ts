import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadByCode = vi.fn();

vi.mock("@/lib/subscriptions/provider-billing-merchant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/subscriptions/provider-billing-merchant")>();
  return {
    ...actual,
    loadProviderSubscriptionByPaystackCode: (...args: unknown[]) => mockLoadByCode(...args),
  };
});

function supabaseSpy() {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    client: {
      from: () => ({
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }),
    },
  };
}

const future = () => new Date(Date.now() + 5 * 86400000).toISOString();
const past = () => new Date(Date.now() - 86400000).toISOString();

describe("isScheduledDowngradePending", () => {
  it("is true whenever a downgrade is scheduled, including after expires_at before the cron runs", async () => {
    const { isScheduledDowngradePending } = await import("../subscription-events");
    expect(isScheduledDowngradePending({ scheduled_plan_id: "p" })).toBe(true);
    expect(isScheduledDowngradePending({ scheduled_plan_id: null })).toBe(false);
    expect(isScheduledDowngradePending(null)).toBe(false);
  });
});

describe("Paystack subscription events during a scheduled downgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subscription.disable keeps the row untouched while the downgrade is pending", async () => {
    mockLoadByCode.mockResolvedValue({
      id: "row-1",
      provider_id: "prov-1",
      billing_provider: "paystack",
      status: "active",
      cancelled_at: null,
      expires_at: future(),
      scheduled_plan_id: "plan-basic",
    });
    const { handleSubscriptionEvent } = await import("../subscription-events");
    const { client, updates } = supabaseSpy();
    await handleSubscriptionEvent(
      { event: "subscription.disable", data: { subscription_code: "SUB_old" } } as never,
      client as never,
    );
    expect(updates).toHaveLength(0);
  });

  it("subscription.disable at period end (after expires_at, before the cron) keeps the row active", async () => {
    mockLoadByCode.mockResolvedValue({
      id: "row-1",
      provider_id: "prov-1",
      billing_provider: "paystack",
      status: "active",
      cancelled_at: null,
      expires_at: past(),
      scheduled_plan_id: "plan-basic",
    });
    const { handleSubscriptionEvent } = await import("../subscription-events");
    const { client, updates } = supabaseSpy();
    await handleSubscriptionEvent(
      { event: "subscription.disable", data: { subscription_code: "SUB_old" } } as never,
      client as never,
    );
    expect(updates).toHaveLength(0);
  });

  it("subscription.not_renew does not flip auto_renew while the downgrade is pending", async () => {
    mockLoadByCode.mockResolvedValue({
      id: "row-1",
      provider_id: "prov-1",
      billing_provider: "paystack",
      status: "active",
      expires_at: future(),
      scheduled_plan_id: "plan-basic",
    });
    const { handleSubscriptionEvent } = await import("../subscription-events");
    const { client, updates } = supabaseSpy();
    await handleSubscriptionEvent(
      { event: "subscription.not_renew", data: { subscription_code: "SUB_old" } } as never,
      client as never,
    );
    expect(updates).toHaveLength(0);
  });

  it("subscription.disable still cancels a row with no scheduled downgrade", async () => {
    mockLoadByCode.mockResolvedValue({
      id: "row-2",
      provider_id: "prov-1",
      billing_provider: "paystack",
      status: "active",
      cancelled_at: null,
      expires_at: future(),
      scheduled_plan_id: null,
    });
    const { handleSubscriptionEvent } = await import("../subscription-events");
    const { client, updates } = supabaseSpy();
    await handleSubscriptionEvent(
      { event: "subscription.disable", data: { subscription_code: "SUB_x" } } as never,
      client as never,
    );
    expect(updates[0]).toMatchObject({ status: "cancelled" });
  });
});
