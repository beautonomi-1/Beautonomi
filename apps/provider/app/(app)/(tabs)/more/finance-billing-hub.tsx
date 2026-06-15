import { Redirect } from "expo-router";

/** Legacy hub — consolidated under Money, Billing, Team & pay, and Payment setup. */
export default function FinanceBillingHubRedirect() {
  return <Redirect href="/(app)/(tabs)/more/money" />;
}
