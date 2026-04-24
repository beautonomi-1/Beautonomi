import WishlistsRecentlyViewedPageClient from "./WishlistsRecentlyViewedPageClient";
import { fetchRecentlyViewedInitial } from "./fetch-recently-viewed-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialProviders = await fetchRecentlyViewedInitial();
  return <WishlistsRecentlyViewedPageClient initialProviders={initialProviders} />;
}
