/**
 * Smart settlement plan for additional charges on existing bookings.
 *
 * Returns a recommended default action and the full set of actions available
 * for the provider to choose from, based on booking context. The provider can
 * always override the recommendation.
 *
 * Decision logic:
 *  - Walk-in bookings → collect_in_person (cash/terminal; no commission gap).
 *  - Online card booking, customer has saved card → charge_card_on_file
 *    (consent-gated: customer must approve the specific charge first).
 *  - Online card booking, no saved card → customer_pay (send to app / web).
 *  - Cash ("pay at salon") / wallet-only / gift-only → collect_in_person
 *    with customer_pay as an available alternative.
 *  - Provider-created non-cash → treat as online (customer_pay).
 */

export type AdditionalChargeAction =
  /** Provider requests customer to pay in-app / via web link (Paystack redirect, wallet, gift). */
  | "customer_pay"
  /** Platform charges the customer's saved Paystack authorization after explicit approval. */
  | "charge_card_on_file"
  /** Provider collects cash, Yoco, bank transfer, or Paystack Terminal. */
  | "collect_in_person";

export interface AdditionalChargeSettlementPlan {
  recommendedAction: AdditionalChargeAction;
  availableActions: AdditionalChargeAction[];
  /**
   * When true, `charge_card_on_file` requires the customer to approve the
   * specific charge before the platform can charge their saved card.
   * This is always true for card-on-file (dispute-safe consent rule).
   */
  cardOnFileRequiresApproval: boolean;
}

interface ResolveInput {
  /**
   * `bookings.booking_source` — `"online"` | `"walk_in"` | `"provider"`.
   */
  bookingSource: string | null | undefined;
  /**
   * Original payment provider on the booking row (`"paystack"`, `"cash"`,
   * `"wallet"`, `"gift_card"`, `"manual"`, `"yoco"`, etc.).
   */
  originalPaymentProvider: string | null | undefined;
  /**
   * True when the customer has at least one non-expired, active, reusable
   * Paystack card on file for their account.
   */
  customerHasSavedCard: boolean;
}

/**
 * Pure function — no DB calls. Pass DB values directly from the booking row
 * and a saved-card check from `payment_methods`.
 */
export function resolveAdditionalChargeSettlementPlan(
  input: ResolveInput,
): AdditionalChargeSettlementPlan {
  const source = (input.bookingSource ?? "online").toLowerCase();
  const provider = (input.originalPaymentProvider ?? "").toLowerCase();
  const hasSavedCard = input.customerHasSavedCard;

  const isWalkIn = source === "walk_in";
  const isProviderCash =
    source === "provider" && (provider === "cash" || provider === "manual");
  const isOnlineCard =
    (source === "online" || source === "provider") &&
    (provider === "paystack" || provider === "manual_card" || provider === "saved_card");
  const isCashOrWalletSolo =
    provider === "cash" ||
    (provider === "wallet" && source !== "online") ||
    (provider === "gift_card" && source !== "online");

  // Walk-in and provider-cash bookings: provider is physically present.
  if (isWalkIn || isProviderCash || isCashOrWalletSolo) {
    return {
      recommendedAction: "collect_in_person",
      availableActions: ["collect_in_person", "customer_pay"],
      cardOnFileRequiresApproval: true,
    };
  }

  // Online card booking with a customer saved card → recommend card-on-file
  // (most seamless: no customer friction beyond the one-tap approval).
  if (isOnlineCard && hasSavedCard) {
    return {
      recommendedAction: "charge_card_on_file",
      availableActions: ["charge_card_on_file", "customer_pay", "collect_in_person"],
      cardOnFileRequiresApproval: true,
    };
  }

  // Online card but no saved card, or any provider-created online booking.
  return {
    recommendedAction: "customer_pay",
    availableActions: ["customer_pay", "collect_in_person"],
    cardOnFileRequiresApproval: true,
  };
}
