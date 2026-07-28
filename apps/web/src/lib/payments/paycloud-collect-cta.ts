/**
 * Collect-or-setup rule: when `payment_paycloud` is on, surfaces must show
 * PaycloudCollectButton (collect when ready/in-flight, else setup link) — never hide.
 */
export type PaycloudCollectContext =
  | "booking"
  | "booking_addons"
  | "additional_charge"
  | "group_booking"
  | "sale"
  | "product_order";

function formatAmount(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "ZAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${currency || "ZAR"} ${safe.toFixed(2)}`;
  }
}

export function formatPaycloudCollectLabel(params: {
  context: PaycloudCollectContext;
  amount: number;
  currency?: string;
  inFlight?: boolean;
  depositAmount?: number | null;
  fullOutstanding?: number | null;
}): string {
  if (params.inFlight) {
    return "Payment in progress — tap to resume";
  }

  const showMoney = Number.isFinite(params.amount) && params.amount > 0.01;
  const money = showMoney ? formatAmount(params.amount, params.currency ?? "ZAR") : null;
  const depositDue =
    params.depositAmount != null &&
    params.depositAmount > 0.01 &&
    params.fullOutstanding != null &&
    params.fullOutstanding > params.depositAmount + 0.01;
  const depositMoney = depositDue
    ? formatAmount(params.depositAmount!, params.currency ?? "ZAR")
    : null;
  const fullMoney =
    depositDue && params.fullOutstanding != null
      ? formatAmount(params.fullOutstanding, params.currency ?? "ZAR")
      : null;

  switch (params.context) {
    case "booking":
      if (depositMoney && fullMoney) {
        return `Card machine · deposit ${depositMoney} of ${fullMoney}`;
      }
      return money ? `Card machine · ${money}` : "Card machine";
    case "booking_addons":
      return money ? `Card machine · add-ons ${money}` : "Card machine · add-ons";
    case "additional_charge":
      return "Card machine";
    case "group_booking":
      if (depositMoney && fullMoney) {
        return `Card machine · deposit ${depositMoney} of ${fullMoney}`;
      }
      return money ? `Card machine · group ${money}` : "Card machine";
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
