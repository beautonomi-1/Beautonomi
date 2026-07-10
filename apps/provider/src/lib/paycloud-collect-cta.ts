export type PaycloudCollectContext =
  | "booking"
  | "booking_addons"
  | "additional_charge"
  | "group_booking"
  | "sale"
  | "product_order";

function formatAmount(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${currency} ${safe.toFixed(2)}`;
}

export function formatPaycloudCollectLabel(params: {
  context: PaycloudCollectContext;
  amount: number;
  currency?: string;
  inFlight?: boolean;
}): string {
  if (params.inFlight) {
    return "Payment in progress — tap to resume";
  }

  const money = formatAmount(params.amount, params.currency ?? "ZAR");

  switch (params.context) {
    case "booking":
      return `Card machine · ${money}`;
    case "booking_addons":
      return `Card machine · add-ons ${money}`;
    case "additional_charge":
      return "Card machine";
    case "group_booking":
      return `Card machine · group ${money}`;
    case "sale":
    case "product_order":
    default:
      return "Card machine";
  }
}

export const PAYCLOUD_SETUP_LABEL = "Set up card machine";

export function inferBookingCollectContext(params: {
  totalAmount: number;
  totalPaid: number;
  unpaidAdditionalCharges: number;
  outstanding: number;
}): "booking" | "booking_addons" {
  const baseOutstanding = Math.max(0, params.totalAmount - params.totalPaid);
  if (
    baseOutstanding <= 0.01 &&
    params.unpaidAdditionalCharges > 0 &&
    Math.abs(params.outstanding - params.unpaidAdditionalCharges) <= 0.01
  ) {
    return "booking_addons";
  }
  return "booking";
}
