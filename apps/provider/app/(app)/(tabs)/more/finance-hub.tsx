import { Redirect } from "expo-router";

export default function FinanceHubRedirect() {
  return <Redirect href="/(app)/(tabs)/more/money?tab=overview" />;
}
