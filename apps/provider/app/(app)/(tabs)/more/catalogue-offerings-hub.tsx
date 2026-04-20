import { Redirect } from "expo-router";

/**
 * Legacy hub — consolidated into `more/catalogue` (same CRUD as Settings → Services menu).
 * Route kept so old bookmarks / deep links still work.
 */
export default function CatalogueOfferingsHubScreen() {
  return <Redirect href="/(app)/(tabs)/more/catalogue" />;
}
