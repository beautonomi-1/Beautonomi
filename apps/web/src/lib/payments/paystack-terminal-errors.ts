"use client";

/** Map Paystack Terminal API error codes to provider-friendly messages. */
export function paystackTerminalErrorMessage(
  message: string | undefined,
  code: string | undefined,
): string {
  switch (code) {
    case "SUBSCRIPTION_REQUIRED":
      return message?.trim() || "Paystack Terminal requires a plan that includes virtual terminals. Upgrade under Subscription.";
    case "PAYSTACK_VIRTUAL_TERMINAL_DISABLED_BY_PLATFORM":
      return "Paystack Terminal isn't enabled for this market.";
    case "LIMIT_REACHED":
      return message?.trim() || "You've reached your Paystack Terminal limit on your current plan. Upgrade to add more terminals.";
    case "LOCATION_TERMINAL_NOT_ALLOWED":
      return "Per-location Paystack terminals aren't available on your plan.";
    case "PROVIDER_NOT_FOUND":
      return "We couldn't find your provider account. Try signing in again or contact support.";
    default:
      return message ?? "Something went wrong. Please try again.";
  }
}
