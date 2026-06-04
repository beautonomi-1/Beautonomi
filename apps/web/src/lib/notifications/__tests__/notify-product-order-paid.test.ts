import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNotifyProviderTeamUsers = vi.fn(async () => undefined);
const mockGetProviderTeamUserIds = vi.fn(async () => ["owner-1", "staff-1"]);
const mockSendTemplateNotification = vi.fn(async () => ({ success: true }));
const mockSyncPushBadgeCount = vi.fn(async () => undefined);
const mockInsertNotification = vi.fn(async () => undefined);
const mockNotifyOrderConfirmation = vi.fn(async () => ({ success: true }));

vi.mock("@/lib/notifications/notify-provider-team", () => ({
  notifyProviderTeamUsers: (...args: unknown[]) => mockNotifyProviderTeamUsers(...args),
  getProviderTeamUserIds: (...args: unknown[]) => mockGetProviderTeamUserIds(...args),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendTemplateNotification: (...args: unknown[]) => mockSendTemplateNotification(...args),
}));

vi.mock("@/lib/notifications/sync-push-badge-count", () => ({
  syncPushBadgeCount: (...args: unknown[]) => mockSyncPushBadgeCount(...args),
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotification: (...args: unknown[]) => mockInsertNotification(...args),
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  notifyOrderConfirmation: (...args: unknown[]) => mockNotifyOrderConfirmation(...args),
}));

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/money/tenant-intl-format", () => ({
  getTenantMoneyFormatter: vi.fn(async () => ({
    format: (n: number) => `R${n.toFixed(2)}`,
  })),
}));

import {
  notifyProductOrderPaidIfTransitioned,
  notifyProductOrderPlacedPendingPayment,
} from "../notify-product-order-paid";

describe("notifyProductOrderPaidIfTransitioned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips all notifications when not transitioned to paid", async () => {
    const supabase = { from: vi.fn() };
    await notifyProductOrderPaidIfTransitioned(supabase as never, "order-1", {
      transitionedToPaid: false,
    });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(mockNotifyProviderTeamUsers).not.toHaveBeenCalled();
    expect(mockInsertNotification).not.toHaveBeenCalled();
    expect(mockNotifyOrderConfirmation).not.toHaveBeenCalled();
  });

  it("resolves online customer_name from users for provider push template", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { full_name: "Jane Client" },
                  error: null,
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: "order-1",
                  order_number: "BO-99",
                  customer_id: "cust-1",
                  provider_id: "prov-1",
                  tenant_id: "tenant-1",
                  total_amount: 100,
                  wallet_amount: 0,
                  order_source: "online",
                  items: [{ id: "i1" }],
                },
                error: null,
              })),
            })),
          })),
        };
      }),
    };

    await notifyProductOrderPaidIfTransitioned(supabase as never, "order-1", {
      transitionedToPaid: true,
    });

    expect(mockSendTemplateNotification).toHaveBeenCalledWith(
      "product_order_placed",
      expect.any(Array),
      expect.objectContaining({ customer_name: "Jane Client" }),
      ["push"],
      expect.any(Object),
    );
  });

  it("notifies provider and customer once with wallet + card breakdown", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: "order-1",
                  order_number: "BO-99",
                  customer_id: "cust-1",
                  provider_id: "prov-1",
                  tenant_id: "tenant-1",
                  total_amount: 500,
                  wallet_amount: 200,
                  order_source: "online",
                  items: [{ id: "i1" }, { id: "i2" }],
                },
                error: null,
              })),
            })),
          })),
        };
      }),
    };

    await notifyProductOrderPaidIfTransitioned(supabase as never, "order-1", {
      transitionedToPaid: true,
    });

    expect(mockNotifyProviderTeamUsers).toHaveBeenCalledTimes(1);
    const msg = mockNotifyProviderTeamUsers.mock.calls[0][1].message as string;
    expect(msg).toContain("R500.00");
    expect(msg).toContain("R200.00 wallet");
    expect(msg).toContain("R300.00 card");
    expect(mockInsertNotification).toHaveBeenCalledTimes(1);
    expect(mockNotifyOrderConfirmation).toHaveBeenCalledWith(
      "cust-1",
      "order-1",
      "BO-99",
      500,
      ["push", "email"],
    );
    expect(mockSendTemplateNotification).toHaveBeenCalledWith(
      "product_order_placed",
      ["owner-1", "staff-1"],
      expect.objectContaining({ order_number: "BO-99" }),
      ["push"],
      expect.objectContaining({ appType: "provider" }),
    );
    expect(mockSyncPushBadgeCount).toHaveBeenCalled();
  });
});

describe("notifyProductOrderPlacedPendingPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies provider for pay-on-delivery placement", async () => {
    await notifyProductOrderPlacedPendingPayment({
      providerId: "prov-1",
      productOrderId: "order-2",
      orderNumber: "BO-2",
      totalAmount: 80,
      tenantId: "tenant-1",
      itemCount: 1,
      paymentMethod: "card_on_delivery",
    });

    expect(mockNotifyProviderTeamUsers).toHaveBeenCalledTimes(1);
    expect(mockNotifyProviderTeamUsers.mock.calls[0][1].message).toContain("card on delivery");
    expect(mockInsertNotification).not.toHaveBeenCalled();
  });
});
