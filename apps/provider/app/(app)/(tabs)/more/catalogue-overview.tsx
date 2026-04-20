import { Redirect } from "expo-router";

/**
 * Legacy browse-only catalogue overview — consolidated into `more/catalogue` (full CRUD).
 */
export default function CatalogueOverviewScreen() {
  return <Redirect href="/(app)/(tabs)/more/catalogue" />;
}
