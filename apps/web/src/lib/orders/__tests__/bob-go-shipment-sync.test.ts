import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/notifications/notify-product-order-status", () => ({
  dispatchProductOrderStatusNotification: vi.fn(),
}));

vi.mock("@/lib/orders/shipping", () => ({
  cancelCourierShipmentForOrder: vi.fn(async () => ({ ok: true })),
}));

import { applyBobGoShipmentSnapshotToOrder } from "@/lib/orders/bob-go-shipment-sync";
import { dispatchProductOrderStatusNotification } from "@/lib/notifications/notify-product-order-status";

function mockAdmin(order: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  const updateChain = {
    eq: () => updateChain,
    neq: async () => ({}),
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    maybeSingle: async () => ({ data: order }),
    update: (patch: Record<string, unknown>) => {
      updates.push(patch);
      return updateChain;
    },
  };
  return {
    admin: { from: () => chain } as any,
    updates,
  };
}

describe("applyBobGoShipmentSnapshotToOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not mark shipped on pending-collection", async () => {
    const { admin, updates } = mockAdmin({
      id: "ord-1",
      provider_id: "p1",
      customer_id: "c1",
      tenant_id: null,
      order_number: "100",
      status: "processing",
      tracking_number: "BG1",
      tracking_url: null,
      carrier: "bob-go",
      shipping_booking_status: "booked",
    });

    await applyBobGoShipmentSnapshotToOrder(admin, "ord-1", {
      id: 1,
      trackingReference: "BG1",
      submissionStatus: "success",
      status: "pending-collection",
      failedReason: null,
      chargedAmount: null,
      chargedWeightKg: null,
      trackingUrl: "https://track.example/bg1",
    });

    expect(updates.some((u) => u.status === "shipped")).toBe(false);
    expect(dispatchProductOrderStatusNotification).not.toHaveBeenCalled();
  });

  it("clears tracking after failed submission when cancel succeeds", async () => {
    const { cancelCourierShipmentForOrder } = await import("@/lib/orders/shipping");
    vi.mocked(cancelCourierShipmentForOrder).mockResolvedValueOnce({ ok: true });

    const { admin, updates } = mockAdmin({
      id: "ord-1",
      provider_id: "p1",
      customer_id: "c1",
      tenant_id: null,
      order_number: "100",
      status: "processing",
      tracking_number: "BG1",
      tracking_url: null,
      carrier: "bob-go",
      shipping_booking_status: "submitting",
    });

    await applyBobGoShipmentSnapshotToOrder(admin, "ord-1", {
      id: 1,
      trackingReference: "BG1",
      submissionStatus: "failed-indefinitely",
      status: "pending",
      failedReason: "No rates",
      chargedAmount: null,
      chargedWeightKg: null,
      trackingUrl: null,
    });

    const final = updates[updates.length - 1];
    expect(final?.tracking_number).toBeNull();
    expect(final?.shipping_booking_status).toBe("failed");
  });

  it("marks shipped and notifies on collected", async () => {
    const { admin } = mockAdmin({
      id: "ord-1",
      provider_id: "p1",
      customer_id: "c1",
      tenant_id: null,
      order_number: "100",
      status: "processing",
      tracking_number: "BG1",
      tracking_url: "https://track.example/bg1",
      carrier: "bob-go",
      shipping_booking_status: "booked",
      collection_location_id: null,
    });

    await applyBobGoShipmentSnapshotToOrder(admin, "ord-1", {
      id: 1,
      trackingReference: "BG1",
      submissionStatus: "success",
      status: "collected",
      failedReason: null,
      chargedAmount: null,
      chargedWeightKg: null,
      trackingUrl: "https://track.example/bg1",
    });

    expect(dispatchProductOrderStatusNotification).toHaveBeenCalledWith(
      expect.objectContaining({ status: "shipped" }),
    );
  });
});
