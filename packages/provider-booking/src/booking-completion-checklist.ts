import {
  isCollectionFulfillment,
  isDeliveryFulfillment,
} from "@beautonomi/utils";

export type BookingCompletionChecklistInput = {
  status?: string | null;
  paymentStatus?: string | null;
  outstanding: number;
  unpaidAdditionalCharges: number;
  productOrders: Array<{ id?: string; status?: string | null; fulfillment_type?: string | null }>;
  hasProductsOnBooking: boolean;
};

export type ChecklistItem = {
  id: "payment" | "additional_charges" | "products";
  label: string;
  done: boolean;
  detail?: string;
};

export type CompletionBlockerCode =
  | "outstanding"
  | "refunded"
  | "additional_charges"
  | "products_collection"
  | "products_delivery"
  | "products_unspecified"
  | "products_unprepared";

export type CompletionBlocker = {
  code: CompletionBlockerCode;
  orderId?: string;
  label: string;
};

const productBlockerCodes: CompletionBlockerCode[] = [
  "products_collection",
  "products_delivery",
  "products_unspecified",
  "products_unprepared",
];

/** First open product handover row (for a compact CTA beside Complete). */
export function firstProductHandoverBlocker(
  blockers: CompletionBlocker[],
): CompletionBlocker | undefined {
  return blockers.find((b) => productBlockerCodes.includes(b.code));
}

const terminalProductStatuses = new Set(["delivered", "cancelled", "refunded"]);

function isOpenProductOrder(status: string | null | undefined): boolean {
  return !terminalProductStatuses.has((status ?? "").toLowerCase());
}

export function buildBookingCompletionChecklist(
  input: BookingCompletionChecklistInput,
): {
  items: ChecklistItem[];
  allDone: boolean;
  blockingLabels: string[];
  blockers: CompletionBlocker[];
} {
  const items: ChecklistItem[] = [];
  const blockingLabels: string[] = [];
  const blockers: CompletionBlocker[] = [];

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
    const label = "Outstanding balance";
    blockingLabels.push(label);
    blockers.push({ code: "outstanding", label });
  }
  if ((input.paymentStatus ?? "").toLowerCase() === "refunded") {
    const label = "Booking fully refunded — cancel instead of completing";
    blockingLabels.push(label);
    blockers.push({ code: "refunded", label });
  }

  const chargesDone = input.unpaidAdditionalCharges <= 0;
  items.push({
    id: "additional_charges",
    label: "Additional charges settled",
    done: chargesDone,
    detail: chargesDone ? undefined : "Unpaid add-on charges",
  });
  if (!chargesDone) {
    const label = "Unpaid additional charges";
    blockingLabels.push(label);
    blockers.push({ code: "additional_charges", label });
  }

  const pendingProductOrders = input.hasProductsOnBooking
    ? input.productOrders.filter((o) => isOpenProductOrder(o.status))
    : [];
  const productsDone =
    !input.hasProductsOnBooking ||
    (input.productOrders.length > 0 && pendingProductOrders.length === 0);

  let productsDetail: string | undefined;
  if (!productsDone) {
    if (input.productOrders.length === 0) {
      productsDetail = "Product has not been marked handed over";
      blockers.push({
        code: "products_unprepared",
        label: "Products not marked collected/delivered",
      });
    } else {
      for (const order of pendingProductOrders) {
        const ft = order.fulfillment_type;
        if (!ft || (!isCollectionFulfillment(ft) && !isDeliveryFulfillment(ft))) {
          blockers.push({
            code: "products_unspecified",
            orderId: order.id,
            label: "Choose pickup or delivery for product order",
          });
        } else if (isCollectionFulfillment(ft)) {
          blockers.push({
            code: "products_collection",
            orderId: order.id,
            label: "Products not marked collected",
          });
        } else {
          blockers.push({
            code: "products_delivery",
            orderId: order.id,
            label: "Products not delivered",
          });
        }
      }
      const hasCollection = pendingProductOrders.some((o) =>
        isCollectionFulfillment(o.fulfillment_type),
      );
      const hasUnspecified = pendingProductOrders.some(
        (o) =>
          !o.fulfillment_type ||
          (!isCollectionFulfillment(o.fulfillment_type) &&
            !isDeliveryFulfillment(o.fulfillment_type)),
      );
      const hasDeliveryOnly = pendingProductOrders.some((o) =>
        isDeliveryFulfillment(o.fulfillment_type),
      );
      if (hasUnspecified) {
        productsDetail = "Choose pickup or delivery";
      } else if (hasCollection && hasDeliveryOnly) {
        productsDetail = "Collect and deliver products before completing";
      } else if (hasCollection) {
        productsDetail = "Not marked collected";
      } else {
        productsDetail = `${pendingProductOrders.length} product order(s) not delivered`;
      }
    }
    if (blockers.some((b) => b.code.startsWith("products_"))) {
      blockingLabels.push("Products not marked collected/delivered");
    }
  }

  items.push({
    id: "products",
    label: "Products handed over",
    done: productsDone,
    detail: productsDone ? undefined : productsDetail,
  });

  return {
    items,
    allDone: items.every((i) => i.done),
    blockingLabels,
    blockers,
  };
}