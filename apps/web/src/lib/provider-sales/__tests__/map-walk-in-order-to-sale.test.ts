import { describe, expect, it } from "vitest";
import {
  mapWalkInOrderToSaleShape,
  mapWalkInPaymentStatus,
  mergeSaleHistoryRows,
} from "../map-walk-in-order-to-sale";

describe("mapWalkInOrderToSaleShape", () => {
  it("maps paid walk-in orders onto the POS sale list shape", () => {
    const row = mapWalkInOrderToSaleShape({
      order: {
        id: "ord-1",
        order_number: "BO-W1",
        paid_at: "2026-09-01T10:00:00.000Z",
        subtotal: 100,
        tax_amount: 15,
        total_amount: 115,
        payment_method: "cash",
        payment_status: "paid",
      },
      items: [
        {
          id: "item-1",
          product_id: "prod-1",
          product_name: "Shampoo",
          quantity: 1,
          unit_price: 100,
          total_price: 100,
        },
      ],
      clientName: "Ada",
      teamMemberId: "staff-1",
      teamMemberName: "Nolo",
    });

    expect(mapWalkInPaymentStatus("paid")).toBe("completed");
    expect(row.ref_number).toBe("BO-W1");
    expect(row.payment_status).toBe("completed");
    expect(row.items[0]?.name).toBe("Shampoo");
    expect(row.team_member_name).toBe("Nolo");
  });

  it("dedupes migrated legacy sales in favor of walk-in product orders", () => {
    const merged = mergeSaleHistoryRows(
      [
        {
          id: "sale-1",
          ref_number: "S1",
          client_name: "Ada",
          date: "2026-09-01T09:00:00.000Z",
          items: [],
          subtotal: 80,
          tax: 0,
          total: 80,
          payment_method: "cash",
          payment_status: "completed",
          team_member_id: null,
          team_member_name: null,
        },
      ],
      [
        {
          id: "ord-1",
          ref_number: "BO-W1",
          client_name: "Ada",
          date: "2026-09-01T10:00:00.000Z",
          items: [],
          subtotal: 80,
          tax: 0,
          total: 80,
          payment_method: "cash",
          payment_status: "completed",
          team_member_id: null,
          team_member_name: null,
        },
      ],
      new Set(["sale-1"]),
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("ord-1");
  });
});
