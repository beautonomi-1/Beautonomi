import { isUuidString } from "../id";

/** `support_tickets.support_context_label` max length. */
export const SUPPORT_CONTEXT_LABEL_MAX = 160;

export type BookingSupportAudience = "customer" | "provider";

export type BookingSupportPrompt = {
  prominence: "urgent" | "helpful";
  category: string;
  title: string;
  body: string;
};

export type SupportTicketPrefill = {
  supportContextType: "booking" | "product_order" | "gift_card" | null;
  supportContextId: string | null;
  supportContextLabel: string;
  category: string | null;
};

/** Noun for a prefilled ticket subject (“Help with booking BTN-…”). */
export function supportPrefillNoun(type: SupportTicketPrefill["supportContextType"]): string {
  if (type === "product_order") return "order";
  if (type === "gift_card") return "gift card";
  return "booking";
}

/** @deprecated Use SupportTicketPrefill — kept so existing booking callers type-check. */
export type BookingSupportTicketPrefill = SupportTicketPrefill;

export const SUPPORT_UUID_CONTEXT_TYPES = new Set([
  "booking",
  "product_order",
  "gift_card",
  "payment",
  "provider_onboarding",
]);

export function shouldSendSupportContextId(contextType: string | null | undefined): boolean {
  return SUPPORT_UUID_CONTEXT_TYPES.has(String(contextType ?? ""));
}

/**
 * Human-readable support label: booking number first, full id in parentheses.
 * Fits the 160-char ticket label column.
 */
export function formatBookingSupportLabel(input: {
  bookingNumber?: string | null;
  bookingId?: string | null;
}): string {
  const number = String(input.bookingNumber ?? "").trim();
  const id = String(input.bookingId ?? "").trim();
  if (number && id && number !== id) {
    const combined = `${number} (${id})`;
    return combined.length <= SUPPORT_CONTEXT_LABEL_MAX
      ? combined
      : number.slice(0, SUPPORT_CONTEXT_LABEL_MAX);
  }
  return (number || id).slice(0, SUPPORT_CONTEXT_LABEL_MAX);
}

export function bookingSupportQuery(input: {
  bookingId?: string | null;
  bookingNumber?: string | null;
  category?: string | null;
}): string {
  const params = new URLSearchParams();
  const bookingId = String(input.bookingId ?? "").trim();
  const bookingNumber = String(input.bookingNumber ?? "").trim();
  const category = String(input.category ?? "").trim();
  if (bookingId) params.set("booking_id", bookingId);
  if (bookingNumber) params.set("booking_number", bookingNumber);
  if (category) params.set("category", category);
  const q = params.toString();
  return q ? `?${q}` : "";
}

export function resolveBookingSupportTicketPrefill(input: {
  bookingId?: string | null;
  bookingNumber?: string | null;
  category?: string | null;
}): SupportTicketPrefill {
  const bookingId = String(input.bookingId ?? "").trim();
  const bookingNumber = String(input.bookingNumber ?? "").trim();
  const category = String(input.category ?? "").trim();
  const hasBooking = Boolean(bookingId || bookingNumber);
  return {
    supportContextType: hasBooking ? "booking" : null,
    supportContextId: isUuidString(bookingId) ? bookingId : null,
    supportContextLabel: formatBookingSupportLabel({ bookingNumber, bookingId }),
    category: category || null,
  };
}

export function resolveSupportTicketPrefillFromSearch(input: {
  bookingId?: string | null;
  bookingNumber?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  giftCardId?: string | null;
  giftCardCode?: string | null;
  category?: string | null;
}): SupportTicketPrefill {
  const orderId = String(input.orderId ?? "").trim();
  const orderNumber = String(input.orderNumber ?? "").trim();
  if (orderId || orderNumber) {
    return {
      supportContextType: "product_order",
      supportContextId: isUuidString(orderId) ? orderId : null,
      supportContextLabel: formatBookingSupportLabel({ bookingNumber: orderNumber, bookingId: orderId }),
      category: String(input.category ?? "").trim() || null,
    };
  }
  const giftCardId = String(input.giftCardId ?? "").trim();
  const giftCardCode = String(input.giftCardCode ?? "").trim();
  if (giftCardId || giftCardCode) {
    return {
      supportContextType: "gift_card",
      supportContextId: isUuidString(giftCardId) ? giftCardId : null,
      supportContextLabel: formatBookingSupportLabel({ bookingNumber: giftCardCode, bookingId: giftCardId }),
      category: String(input.category ?? "").trim() || null,
    };
  }
  return resolveBookingSupportTicketPrefill({
    bookingId: input.bookingId,
    bookingNumber: input.bookingNumber,
    category: input.category,
  });
}

export function supportTicketQuery(input: {
  bookingId?: string | null;
  bookingNumber?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  giftCardId?: string | null;
  giftCardCode?: string | null;
  category?: string | null;
}): string {
  const params = new URLSearchParams();
  const bookingId = String(input.bookingId ?? "").trim();
  const bookingNumber = String(input.bookingNumber ?? "").trim();
  const orderId = String(input.orderId ?? "").trim();
  const orderNumber = String(input.orderNumber ?? "").trim();
  const giftCardId = String(input.giftCardId ?? "").trim();
  const giftCardCode = String(input.giftCardCode ?? "").trim();
  const category = String(input.category ?? "").trim();
  if (bookingId) params.set("booking_id", bookingId);
  if (bookingNumber) params.set("booking_number", bookingNumber);
  if (orderId) params.set("order_id", orderId);
  if (orderNumber) params.set("order_number", orderNumber);
  if (giftCardId) params.set("gift_card_id", giftCardId);
  if (giftCardCode) params.set("gift_card_code", giftCardCode);
  if (category) params.set("category", category);
  const q = params.toString();
  return q ? `?${q}` : "";
}

export function getProductOrderSupportPrompt(input: {
  status?: string | null;
  paymentStatus?: string | null;
}): BookingSupportPrompt {
  const status = String(input.status || "").toLowerCase();
  const paymentStatus = String(input.paymentStatus || "").toLowerCase();

  if (isFailedPaymentStatus(paymentStatus)) {
    return {
      prominence: "urgent",
      category: "payment_failed_charge",
      title: "Payment didn’t go through",
      body: "Retry payment, or contact support and quote this order number so we can look it up quickly.",
    };
  }
  if (status === "cancelled" || status === "refunded") {
    return {
      prominence: "urgent",
      category: "payment_refund",
      title: "Need help with this cancelled order?",
      body: "Contact support and quote this order number if a refund or restock looks wrong.",
    };
  }
  if (status === "shipped" || status === "processing") {
    return {
      prominence: "helpful",
      category: "order_status_shipping",
      title: "Questions about this delivery?",
      body: "Contact support and quote the order number so we can check tracking and the merchant.",
    };
  }
  return {
    prominence: "helpful",
    category: "order_status_shipping",
    title: "Need help with this order?",
    body: "Contact support and quote the order number so we can find it immediately.",
  };
}

function isFailedPaymentStatus(paymentStatus: string): boolean {
  return (
    paymentStatus === "failed" ||
    paymentStatus === "payment_failed" ||
    paymentStatus === "declined"
  );
}

/**
 * Support copy for booking detail. Always returns a prompt so the user can
 * reach support with the booking number; problem states are urgent.
 */
export function getBookingSupportPrompt(input: {
  status?: string | null;
  paymentStatus?: string | null;
  outstandingBalance?: number | null;
  audience?: BookingSupportAudience;
}): BookingSupportPrompt {
  const status = String(input.status || "").toLowerCase();
  const paymentStatus = String(input.paymentStatus || "").toLowerCase();
  const outstanding = Number(input.outstandingBalance ?? 0);
  const audience = input.audience ?? "customer";
  const isProvider = audience === "provider";

  const stuckPendingPayment = status === "pending_payment" && outstanding > 0.005;

  if (isFailedPaymentStatus(paymentStatus) || stuckPendingPayment) {
    return {
      prominence: "urgent",
      category: "payment_failed_charge",
      title: isProvider ? "Payment still outstanding" : "Payment didn’t go through",
      body: isProvider
        ? "If the customer was charged but this booking still looks unpaid, contact support and quote the booking number."
        : "Retry payment, or contact support and quote this booking number so we can look it up quickly.",
    };
  }

  if (status === "no_show") {
    return {
      prominence: "urgent",
      category: isProvider ? "booking_issue" : "booking_provider_no_show",
      title: "Need help with this no-show?",
      body: isProvider
        ? "If this was marked by mistake or you need help with the fee, contact support with the booking number."
        : "If this doesn’t look right or you need a refund, contact support and quote this booking number.",
    };
  }

  if (status === "cancelled") {
    const paidish = ["paid", "partially_paid", "refunded", "partially_refunded"].includes(
      paymentStatus,
    );
    return {
      prominence: paidish ? "urgent" : "helpful",
      category: paidish ? "payment_refund" : "booking_reschedule_cancel",
      title: paidish ? "Need a refund or fee review?" : "Need help with this cancellation?",
      body: "Contact support and quote this booking number. We’ll have the full reference ready.",
    };
  }

  if (paymentStatus === "refunded" || paymentStatus === "partially_refunded") {
    return {
      prominence: "helpful",
      category: "payment_refund",
      title: "Questions about this refund?",
      body: "Contact support and quote this booking number if the amount or timing looks wrong.",
    };
  }

  return {
    prominence: "helpful",
    category: "booking_issue",
    title: "Need help with this booking?",
    body: "Contact support and quote the booking number so we can find it immediately.",
  };
}
