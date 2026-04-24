import WishlistsPageClient from "./WishlistsPageClient";
import { fetchWishlistsPageInitial } from "./fetch-wishlists-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await fetchWishlistsPageInitial();
  return <WishlistsPageClient initial={initial} />;
}
