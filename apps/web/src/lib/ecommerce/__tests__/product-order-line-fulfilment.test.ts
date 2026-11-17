import { describe, expect, it } from "vitest";
import {
  deriveOrderStatusFromLines,
  filterProductOrderStatusActions,
  isValidLineTransition,
  lineStatusForOrderStatus,
  lineStatusesAdvancedByOrderStatus,
  productOrderStatusFitsFulfillment,
  syncProductOrderLinesToOrderStatus,
} from "@/lib/ecommerce/product-order-line-fulfilment";

const line = (id: string, fulfilment_status: string) => ({
  id,
  quantity: 1,
  fulfilment_status,
});

describe("product order fulfilment paths", () => {
  it("keeps delivery on shipped and collection on ready for collection", () => {
    expect(productOrderStatusFitsFulfillment("shipped", "delivery")).toBe(true);
    expect(productOrderStatusFitsFulfillment("ready_for_collection", "delivery")).toBe(false);
    expect(productOrderStatusFitsFulfillment("shipped", "collection")).toBe(false);
    expect(productOrderStatusFitsFulfillment("shipped", "pickup")).toBe(false);
    expect(productOrderStatusFitsFulfillment("ready_for_collection", "pickup")).toBe(true);
    expect(productOrderStatusFitsFulfillment("delivered", "collection")).toBe(true);
    expect(productOrderStatusFitsFulfillment("cancelled", "delivery")).toBe(true);
  });

  it("offers only the next step that matches how the order is fulfilled", () => {
    const processing = [
      { next: "shipped", label: "Mark shipped" },
      { next: "ready_for_collection", label: "Ready for collection" },
    ];
    expect(filterProductOrderStatusActions(processing, "delivery").map((a) => a.next)).toEqual(["shipped"]);
    expect(filterProductOrderStatusActions(processing, "collection").map((a) => a.next)).toEqual([
      "ready_for_collection",
    ]);
  });

  it("derives collection as ready once every active line is packed, and delivery as still processing", () => {
    const lines = [line("a", "packed"), line("b", "packed")];
    expect(
      deriveOrderStatusFromLines({ lines, currentStatus: "confirmed", fulfillmentType: "collection" }),
    ).toBe("ready_for_collection");
    expect(
      deriveOrderStatusFromLines({ lines, currentStatus: "confirmed", fulfillmentType: "pickup" }),
    ).toBe("ready_for_collection");
    expect(
      deriveOrderStatusFromLines({ lines, currentStatus: "confirmed", fulfillmentType: "delivery" }),
    ).toBe("processing");
  });

  it("derives shipped only after every delivery line has left, and collected only when every collection line is delivered", () => {
    const dispatched = [line("a", "shipped"), line("b", "delivered")];
    expect(
      deriveOrderStatusFromLines({ lines: dispatched, currentStatus: "processing", fulfillmentType: "delivery" }),
    ).toBe("shipped");
    expect(
      deriveOrderStatusFromLines({
        lines: [line("a", "delivered"), line("b", "delivered")],
        currentStatus: "ready_for_collection",
        fulfillmentType: "collection",
      }),
    ).toBe("delivered");
  });

  it("does not move an order backwards from a status the provider already set", () => {
    expect(
      deriveOrderStatusFromLines({
        lines: [line("a", "packed")],
        currentStatus: "shipped",
        fulfillmentType: "delivery",
      }),
    ).toBeNull();
  });

  it("refuses a shipped line on a collection order and still allows packed then collected", () => {
    expect(isValidLineTransition("packed", "shipped", "collection")).toBe(false);
    expect(isValidLineTransition("packed", "shipped", "pickup")).toBe(false);
    expect(isValidLineTransition("packed", "delivered", "collection")).toBe(true);
    expect(isValidLineTransition("pending", "packed", "collection")).toBe(true);
    expect(isValidLineTransition("packed", "shipped", "delivery")).toBe(true);
    expect(isValidLineTransition("delivered", "shipped", "delivery")).toBe(false);
  });

  it("maps an order status onto the line statuses that should move with it", () => {
    expect(lineStatusForOrderStatus("ready_for_collection")).toBe("packed");
    expect(lineStatusesAdvancedByOrderStatus("ready_for_collection")).toEqual(["pending"]);
    expect(lineStatusForOrderStatus("shipped")).toBe("shipped");
    expect(lineStatusesAdvancedByOrderStatus("shipped")).toEqual(["pending", "packed"]);
    expect(lineStatusForOrderStatus("delivered")).toBe("delivered");
    expect(lineStatusesAdvancedByOrderStatus("delivered")).toEqual(["pending", "packed", "shipped"]);
    expect(lineStatusForOrderStatus("cancelled")).toBeNull();
  });

  it("advances open lines when the order is marked shipped and leaves delivered lines alone", async () => {
    const rows = [
      { id: "pending", quantity: 2, fulfilment_status: "pending" },
      { id: "packed", quantity: 1, fulfilment_status: "packed" },
      { id: "done", quantity: 1, fulfilment_status: "delivered" },
      { id: "cancelled", quantity: 1, fulfilment_status: "cancelled" },
    ];
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: rows, error: null }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_column: string, id: string) => {
            updates.push({ id, patch });
            return { error: null };
          },
        }),
      }),
    };

    await syncProductOrderLinesToOrderStatus(supabase, "ord-1", "shipped");

    expect(updates.map((u) => u.id).sort()).toEqual(["packed", "pending"]);
    expect(updates.every((u) => u.patch.fulfilment_status === "shipped")).toBe(true);
    expect(updates.find((u) => u.id === "pending")?.patch.fulfilled_qty).toBe(2);
  });
});
