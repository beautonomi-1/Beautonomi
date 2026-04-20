import { Redirect } from "expo-router";

/**
 * Legacy alias — full earnings & transactions live on `finance.tsx`.
 */
export default function FinanceHubRedirect() {
  return <Redirect href="/(app)/(tabs)/more/finance" />;
}
