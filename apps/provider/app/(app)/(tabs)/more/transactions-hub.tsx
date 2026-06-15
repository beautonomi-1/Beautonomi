import { Redirect } from "expo-router";

/** Legacy hub — ledger & sales live on the Money hub. */
export default function TransactionsHubRedirect() {
  return <Redirect href="/(app)/(tabs)/more/money?tab=ledger" />;
}
