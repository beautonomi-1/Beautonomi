export type PaycloudPaymentErrorAction =
  | "none"
  | "open_card_machines"
  | "open_subscription"
  | "contact_support"
  | "retry"
  | "resume";

export type PaycloudPaymentErrorOwner = "provider" | "beautonomi";

export interface HumanizedPaycloudPaymentError {
  title: string;
  message: string;
  action: PaycloudPaymentErrorAction;
  owner: PaycloudPaymentErrorOwner;
}

/** All error codes routes and guards may return. Keep in sync with API handlers. */
export const PAYCLOUD_PAYMENT_ERROR_CODES = [
  "SUBSCRIPTION_REQUIRED",
  "PAYCLOUD_NOT_ACCEPTED",
  "TERMINAL_UNAVAILABLE",
  "TERMINAL_NOT_FOUND",
  "TERMINAL_NOT_CONFIGURED",
  "TERMINAL_MISSING",
  "TERMINAL_INACTIVE",
  "TERMINAL_SUSPENDED",
  "MERCHANT_MISSING",
  "MERCHANT_INACTIVE",
  "TEST_MODE_DISABLED",
  "PLATFORM_CREDENTIALS_MISSING",
  "DEVICE_TERMINAL_MISMATCH",
  "DEVICE_SERIAL_REQUIRED",
  "AMOUNT_MISMATCH",
  "TERMINAL_IN_FLIGHT",
  "ENTITY_IN_FLIGHT",
  "ALREADY_PAID",
  "BOOKING_NOT_COLLECTIBLE",
  "ZERO_AMOUNT",
  "ENV_MISMATCH",
  "INVALID_ENTITY",
  "QR_NOT_ENABLED",
  "CASHBACK_NOT_ENABLED",
  "SAME_TERMINAL_DISABLED",
  "NOTIFY_URL_INVALID",
  "GROUP_ALREADY_PAID",
  "ORDER_NOT_COLLECTIBLE",
  "CHARGE_NOT_COLLECTIBLE",
  "BOOKING_NOT_FOUND",
  "SALE_NOT_FOUND",
  "ORDER_NOT_FOUND",
  "CHARGE_NOT_FOUND",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "NOT_VOIDABLE",
  "MISSING_REFS",
  "NO_TERMINAL",
  "TERMINAL_LIMIT_REACHED",
  "DUPLICATE_TERMINAL",
  "MERCHANT_AMBIGUOUS",
  "TENANT_NOT_FOUND",
  "INTERNAL_ERROR",
  "POLL_TIMEOUT",
  "PAYCLOUD_DISABLED_BY_PLATFORM",
] as const;

export type PaycloudPaymentErrorCode = (typeof PAYCLOUD_PAYMENT_ERROR_CODES)[number];

export function humanizePaycloudPaymentError(
  code: string | undefined,
  fallback?: string,
): HumanizedPaycloudPaymentError {
  switch (code) {
    case "SUBSCRIPTION_REQUIRED":
      return {
        title: "Plan upgrade needed",
        message: "Upgrade your plan to use Beautonomi card machines.",
        action: "open_subscription",
        owner: "provider",
      };
    case "PAYCLOUD_NOT_ACCEPTED":
      return {
        title: "Card payments are off",
        message: "Enable in-person card payments in Card machines settings.",
        action: "open_card_machines",
        owner: "provider",
      };
    case "TERMINAL_UNAVAILABLE":
    case "TERMINAL_NOT_FOUND":
    case "TERMINAL_MISSING":
      return {
        title: "Card machine unavailable",
        message:
          fallback ||
          "Could not reach the card machine. Check it is powered on, online, and connected to the internet.",
        action: "open_card_machines",
        owner: "provider",
      };
    case "TERMINAL_INACTIVE":
      return {
        title: "Card machine inactive",
        message: "This card machine is turned off. Turn it on in Card machines settings.",
        action: "open_card_machines",
        owner: "provider",
      };
    case "TERMINAL_SUSPENDED":
      return {
        title: "Card machine suspended",
        message: "This card machine has been suspended. Contact Beautonomi for help.",
        action: "contact_support",
        owner: "beautonomi",
      };
    case "TERMINAL_NOT_CONFIGURED":
    case "MERCHANT_MISSING":
      return {
        title: "Card machine setup pending",
        message: "This card machine isn't fully set up yet. Finish setup in Card machines settings.",
        action: "open_card_machines",
        owner: "provider",
      };
    case "MERCHANT_INACTIVE":
      return {
        title: "Card machine account inactive",
        message: "Your card machine payment account isn't active yet. Contact Beautonomi if this continues.",
        action: "contact_support",
        owner: "beautonomi",
      };
    case "TEST_MODE_DISABLED":
      return {
        title: "Test mode is off",
        message: "Test mode is switched off for your account. Use a live card machine or ask Beautonomi to enable test mode.",
        action: "contact_support",
        owner: "beautonomi",
      };
    case "PLATFORM_CREDENTIALS_MISSING":
      return {
        title: "Card machine account activating",
        message:
          "Beautonomi is still activating this machine's payment account. Nothing for you to do — we'll notify you when it's ready.",
        action: "contact_support",
        owner: "beautonomi",
      };
    case "DEVICE_TERMINAL_MISMATCH":
      return {
        title: "Wrong card machine",
        message:
          "This device does not match the selected card machine. Choose the machine registered to this device.",
        action: "open_card_machines",
        owner: "provider",
      };
    case "DEVICE_SERIAL_REQUIRED":
      return {
        title: "Device not linked",
        message:
          "Could not identify this device. Link it in Card machines or send to the card machine instead.",
        action: "open_card_machines",
        owner: "provider",
      };
    case "AMOUNT_MISMATCH":
      return {
        title: "Amount mismatch",
        message: "Amount does not match the outstanding balance.",
        action: "none",
        owner: "provider",
      };
    case "TERMINAL_IN_FLIGHT":
    case "ENTITY_IN_FLIGHT":
      return {
        title: "Payment already in progress",
        message: fallback || "A payment is already in progress. You can resume it or cancel it first.",
        action: "resume",
        owner: "provider",
      };
    case "ALREADY_PAID":
      return {
        title: "Already paid",
        message: fallback || "This item is already paid.",
        action: "none",
        owner: "provider",
      };
    case "BOOKING_NOT_COLLECTIBLE":
      return {
        title: "Cannot charge",
        message: fallback || "This booking cannot be charged.",
        action: "none",
        owner: "provider",
      };
    case "ZERO_AMOUNT":
      return {
        title: "Nothing to charge",
        message: "There is no outstanding balance to collect.",
        action: "none",
        owner: "provider",
      };
    case "ENV_MISMATCH":
      return {
        title: "Test vs live mismatch",
        message: "This card machine is set up for a different mode (test vs live). Choose a matching machine.",
        action: "open_card_machines",
        owner: "provider",
      };
    case "INVALID_ENTITY":
      return {
        title: "Cannot charge this item",
        message: "This item can't be charged on a card machine.",
        action: "none",
        owner: "provider",
      };
    case "QR_NOT_ENABLED":
      return {
        title: "QR payments off",
        message: "QR wallet payments are not enabled for this account.",
        action: "open_card_machines",
        owner: "provider",
      };
    case "CASHBACK_NOT_ENABLED":
      return {
        title: "Cashback off",
        message: "Cashback is not enabled for this account.",
        action: "open_card_machines",
        owner: "provider",
      };
    case "SAME_TERMINAL_DISABLED":
      return {
        title: "Same-device pay unavailable",
        message: "Paying on this device is not enabled for your account.",
        action: "contact_support",
        owner: "beautonomi",
      };
    case "NOTIFY_URL_INVALID":
      return {
        title: "Configuration error",
        message: "PayCloud notify URL is invalid. Contact Beautonomi support.",
        action: "contact_support",
        owner: "beautonomi",
      };
    case "GROUP_ALREADY_PAID":
      return {
        title: "Group already paid",
        message: "This group booking is already paid.",
        action: "none",
        owner: "provider",
      };
    case "ORDER_NOT_COLLECTIBLE":
      return {
        title: "Order not collectible",
        message: fallback || "This order cannot be charged on a card machine.",
        action: "none",
        owner: "provider",
      };
    case "CHARGE_NOT_COLLECTIBLE":
      return {
        title: "Charge not collectible",
        message: fallback || "This additional charge cannot be collected.",
        action: "none",
        owner: "provider",
      };
    case "BOOKING_NOT_FOUND":
    case "SALE_NOT_FOUND":
    case "ORDER_NOT_FOUND":
    case "CHARGE_NOT_FOUND":
      return {
        title: "Not found",
        message: fallback || "The item to charge could not be found.",
        action: "none",
        owner: "provider",
      };
    case "VALIDATION_ERROR":
      return {
        title: "Invalid request",
        message: fallback || "Check the payment details and try again.",
        action: "none",
        owner: "provider",
      };
    case "RATE_LIMITED":
      return {
        title: "Please wait",
        message: fallback || "Please wait a moment before checking again.",
        action: "retry",
        owner: "provider",
      };
    case "NOT_VOIDABLE":
      return {
        title: "Cannot void",
        message: fallback || "Only successful payments can be voided on the card machine.",
        action: "none",
        owner: "provider",
      };
    case "MISSING_REFS":
      return {
        title: "Missing references",
        message:
          fallback ||
          "This payment is missing the references needed to void or refund on the card machine.",
        action: "contact_support",
        owner: "beautonomi",
      };
    case "NO_TERMINAL":
      return {
        title: "No card machine",
        message: "No card machine is linked to this payment.",
        action: "open_card_machines",
        owner: "provider",
      };
    case "TERMINAL_LIMIT_REACHED":
      return {
        title: "Machine limit reached",
        message: "Your plan's card machine limit has been reached. Upgrade or remove a machine.",
        action: "open_subscription",
        owner: "provider",
      };
    case "DUPLICATE_TERMINAL":
      return {
        title: "Duplicate machine",
        message: "This serial number is already registered.",
        action: "open_card_machines",
        owner: "provider",
      };
    case "MERCHANT_AMBIGUOUS":
      return {
        title: "Setup unclear",
        message: "Multiple merchant accounts were found. Contact Beautonomi to resolve this.",
        action: "contact_support",
        owner: "beautonomi",
      };
    case "TENANT_NOT_FOUND":
      return {
        title: "Market not found",
        message: "Your market configuration could not be loaded. Contact Beautonomi.",
        action: "contact_support",
        owner: "beautonomi",
      };
    case "POLL_TIMEOUT":
      return {
        title: "No response",
        message:
          fallback ||
          "The card machine did not respond in time. You can resume or cancel the payment.",
        action: "resume",
        owner: "provider",
      };
    case "PAYCLOUD_DISABLED_BY_PLATFORM":
      return {
        title: "Card machines unavailable",
        message: "Card machines are not enabled for your market.",
        action: "contact_support",
        owner: "beautonomi",
      };
    case "INTERNAL_ERROR":
      return {
        title: "Something went wrong",
        message: fallback || "An unexpected error occurred. Try again or contact support.",
        action: "retry",
        owner: "beautonomi",
      };
    default:
      return {
        title: "Payment failed",
        message: fallback || "Card payment could not be started.",
        action: "retry",
        owner: "provider",
      };
  }
}
