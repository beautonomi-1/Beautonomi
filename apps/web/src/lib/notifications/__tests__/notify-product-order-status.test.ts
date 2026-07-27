import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDispatchTemplateNotification = vi.fn(async () => ({ success: true }));

vi.mock("@/lib/notifications/dispatch-template-notification", () => ({
  dispatchTemplateNotification: (...args: unknown[]) => mockDispatchTemplateNotification(...args),
}));

vi.mock("@/lib/money/tenant-intl-format", () => ({
  getTenantMoneyFormatter: vi.fn(async () => ({
    format: (n: number) => `R${n.toFixed(2)}`,
  })),
}));

import {
  notifyProductOrderStatusChange,
  dispatchProductOrderStatusNotification,
} from "../notify-product-order-status";

describe("notifyProductOrderStatusChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches product_order_cancelled with push and email", async () => {
    await notifyProductOrderStatusChange({
      customerId: "cust-1",
      status: "cancelled",
      orderId: "order-1",
      orderNumber: "PO-100",
      tenantId: "tenant-1",
      cancellationReason: "Out of stock",
    });

    expect(mockDispatchTemplateNotification).toHaveBeenCalledWith(
      "product_order_cancelled",
      ["cust-1"],
      expect.objectContaining({
        order_number: "PO-100",
        order_id: "order-1",
        cancellation_reason: "Out of stock",
      }),
      ["push", "email"],
      { appType: "customer", tenantId: "tenant-1" },
    );
  });

  it("dispatches product_order_shipped with tracking variables", async () => {
    await notifyProductOrderStatusChange({
      customerId: "cust-1",
      status: "shipped",
      orderId: "order-2",
      orderNumber: "PO-200",
      trackingNumber: "TRK123",
      carrier: "DHL",
      estimatedDelivery: "2026-07-30",
    });

    expect(mockDispatchTemplateNotification).toHaveBeenCalledWith(
      "product_order_shipped",
      ["cust-1"],
      expect.objectContaining({
        tracking_number: "TRK123",
        carrier: "DHL",
        estimated_delivery: "2026-07-30",
        estimated_info: "Estimated delivery: 2026-07-30",
      }),
      ["push", "email"],
      expect.any(Object),
    );
  });

  it("dispatches product_order_refunded with formatted refund amount", async () => {
    await notifyProductOrderStatusChange({
      customerId: "cust-1",
      status: "refunded",
      orderId: "order-3",
      orderNumber: "PO-300",
      refundAmountFormatted: "R150.00",
    });

    expect(mockDispatchTemplateNotification).toHaveBeenCalledWith(
      "product_order_refunded",
      ["cust-1"],
      expect.objectContaining({
        refund_amount: "R150.00",
      }),
      ["push", "email"],
      expect.any(Object),
    );
  });
});

describe("dispatchProductOrderStatusNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads provider name for confirmed status", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { business_name: "Glow Salon" },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };

    await dispatchProductOrderStatusNotification({
      supabase: supabase as never,
      customerId: "cust-1",
      status: "confirmed",
      orderId: "order-1",
      orderNumber: "PO-1",
      providerId: "prov-1",
    });

    expect(mockDispatchTemplateNotification).toHaveBeenCalledWith(
      "product_order_confirmed",
      ["cust-1"],
      expect.objectContaining({ provider_name: "Glow Salon" }),
      ["push", "email"],
      expect.any(Object),
    );
  });

  it("loads collection location for ready_for_collection", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "provider_locations") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    name: "Main Store",
                    address_line1: "12 Main Rd",
                    city: "Cape Town",
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };

    await dispatchProductOrderStatusNotification({
      supabase: supabase as never,
      customerId: "cust-1",
      status: "ready_for_collection",
      orderId: "order-1",
      orderNumber: "PO-1",
      collectionLocationId: "loc-1",
    });

    expect(mockDispatchTemplateNotification).toHaveBeenCalledWith(
      "product_order_ready_collection",
      ["cust-1"],
      expect.objectContaining({
        location_name: "Main Store",
        location_address: "12 Main Rd, Cape Town",
      }),
      ["push", "email"],
      expect.any(Object),
    );
  });
});
