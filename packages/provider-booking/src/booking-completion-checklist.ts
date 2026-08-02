export type BookingCompletionChecklistInput = {
  status?: string | null;
  paymentStatus?: string | null;
  outstanding: number;
  unpaidAdditionalCharges: number;
  productOrders: Array<{ status?: string | null; fulfillment_type?: string | null }>;
  hasProductsOnBooking: boolean;
};

export type ChecklistItem = {
  id: "payment" | "additional_charges" | "products";
  label: string;
  done: boolean;
  detail?: string;
};

export function buildBookingCompletionChecklist(
  input: BookingCompletionChecklistInput,
): { items: ChecklistItem[]; allDone: boolean; blockingLabels: string[] } {
  const items: ChecklistItem[] = [];
  const blockingLabels: string[] = [];

  const paymentDone =
    input.outstanding <= 0 &&
    (input.paymentStatus ?? "").toLowerCase() !== "refunded";
  items.push({
    id: "payment",
    label: "Payment collected",
    done: paymentDone,
    detail: paymentDone ? undefined : `Balance still due`,
  });
  if (!paymentDone && input.outstanding > 0) {
    blockingLabels.push("Outstanding balance");
  }
  if ((input.paymentStatus ?? "").toLowerCase() === "refunded") {
    blockingLabels.push("Booking fully refunded — cancel instead of completing");
  }

  const chargesDone = input.unpaidAdditionalCharges <= 0;
  items.push({
    id: "additional_charges",
    label: "Additional charges settled",
    done: chargesDone,
    detail: chargesDone ? undefined : "Unpaid add-on charges",
  });
  if (!chargesDone) blockingLabels.push("Unpaid additional charges");

  const terminalProductStatuses = new Set(["delivered", "cancelled", "refunded"]);
  const pendingProductOrders =
    input.hasProductsOnBooking && input.productOrders.length > 0
      ? input.productOrders.filter((o) => !terminalProductStatuses.has((o.status ?? "").toLowerCase()))
      : [];
  const productsDone = !input.hasProductsOnBooking || pendingProductOrders.length === 0;
  items.push({
    id: "products",
    label: "Products handed over",
    done: productsDone,
    detail: productsDone ? undefined : `${pendingProductOrders.length} product order(s) not delivered`,
  });
  if (!productsDone) blockingLabels.push("Products not marked collected/delivered");

  return {
    items,
    allDone: items.every((i) => i.done),
    blockingLabels,
  };
}
