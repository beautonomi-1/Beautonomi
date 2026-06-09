import { Ionicons } from "@expo/vector-icons";

export type ProviderActivityIcon = {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
};

/** Shared icon map for dashboard recent activity and More → Activity timeline. */
export function getProviderActivityIcon(type: string): ProviderActivityIcon {
  switch (type) {
    case "booking_created":
    case "new_booking":
      return { name: "book-outline", color: "#6366f1", bg: "#eef2ff" };
    case "booking_confirmed":
      return { name: "checkmark-outline", color: "#4f46e5", bg: "#eef2ff" };
    case "booking_rescheduled":
      return { name: "calendar-outline", color: "#7c3aed", bg: "#f5f3ff" };
    case "booking_started":
      return { name: "play-circle-outline", color: "#0ea5e9", bg: "#e0f2fe" };
    case "booking_completed":
      return { name: "checkmark-circle-outline", color: "#22c55e", bg: "#f0fdf4" };
    case "booking_cancelled":
      return { name: "close-circle-outline", color: "#ef4444", bg: "#fef2f2" };
    case "booking_no_show":
      return { name: "person-remove-outline", color: "#b45309", bg: "#fffbeb" };
    case "payment_received":
    case "ledger_earnings":
    case "booking_earnings":
      return { name: "cash-outline", color: "#22c55e", bg: "#f0fdf4" };
    case "product_order_earnings":
    case "product_sale_completed":
      return { name: "bag-handle-outline", color: "#059669", bg: "#ecfdf5" };
    case "tip_recognized":
      return { name: "heart-outline", color: "#16a34a", bg: "#f0fdf4" };
    case "travel_fee_recognized":
      return { name: "car-outline", color: "#7c3aed", bg: "#f5f3ff" };
    case "additional_charge_earnings":
      return { name: "add-circle-outline", color: "#0f766e", bg: "#f0fdfa" };
    case "cancellation_fee_recognized":
      return { name: "receipt-outline", color: "#b45309", bg: "#fffbeb" };
    case "earnings_reversal":
    case "refund_recognized":
      return { name: "return-down-back-outline", color: "#dc2626", bg: "#fef2f2" };
    case "payout_sent":
      return { name: "arrow-forward-circle-outline", color: "#7c3aed", bg: "#f5f3ff" };
    case "subscription_charge":
      return { name: "card-outline", color: "#b45309", bg: "#fffbeb" };
    case "ads_payment":
      return { name: "megaphone-outline", color: "#c026d3", bg: "#fdf4ff" };
    case "gift_card_sale":
      return { name: "gift-outline", color: "#db2777", bg: "#fdf2f8" };
    case "membership_sale":
      return { name: "ribbon-outline", color: "#7c3aed", bg: "#f5f3ff" };
    case "new_review":
      return { name: "star-outline", color: "#f59e0b", bg: "#fffbeb" };
    case "new_client":
      return { name: "person-add-outline", color: "#3b82f6", bg: "#eff6ff" };
    default:
      return { name: "ellipse-outline", color: "#6b7280", bg: "#f3f4f6" };
  }
}
