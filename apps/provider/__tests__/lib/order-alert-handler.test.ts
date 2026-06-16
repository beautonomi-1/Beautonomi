import {
  flushPendingOrderAlerts,
  handleOrderAlertRow,
  shouldAlertForOrder,
  type OrderAlertRow,
} from "@/lib/order-alert-handler";

describe("order-alert-handler", () => {
  const paidRow: OrderAlertRow = {
    id: "order-1",
    order_number: "BO-10001",
    payment_status: "paid",
    status: "confirmed",
    order_source: "online",
  };

  it("alerts on paid insert for online orders", () => {
    expect(shouldAlertForOrder("insert", paidRow)).toBe(true);
  });

  it("excludes walk-in and appointment sources", () => {
    expect(
      shouldAlertForOrder("insert", { ...paidRow, order_source: "walk_in" }),
    ).toBe(false);
    expect(
      shouldAlertForOrder("insert", { ...paidRow, order_source: "appointment" }),
    ).toBe(false);
  });

  it("alerts on paid transition update", () => {
    expect(
      shouldAlertForOrder(
        "update",
        { ...paidRow, payment_status: "paid" },
        { ...paidRow, payment_status: "pending" },
      ),
    ).toBe(true);
  });

  it("queues when inactive and flushes on foreground", () => {
    const seen = new Set<string>();
    const pending: OrderAlertRow[] = [];
    const alerts: OrderAlertRow[] = [];

    handleOrderAlertRow("insert", paidRow, seen, false, (row) => alerts.push(row), pending);
    expect(alerts).toHaveLength(0);
    expect(pending).toHaveLength(1);

    flushPendingOrderAlerts(pending, seen, (row) => alerts.push(row));
    expect(alerts).toHaveLength(1);
  });
});
