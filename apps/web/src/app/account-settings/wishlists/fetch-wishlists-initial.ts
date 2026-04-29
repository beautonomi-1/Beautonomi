import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getWishlists } from "@/app/api/me/wishlists/route";
import { GET as getWishlistProviders } from "@/app/api/me/wishlists/providers/route";
import { GET as getWishlistProducts } from "@/app/api/me/wishlists/products/route";
import { GET as getExploreSaved } from "@/app/api/explore/saved/route";
import { GET as getExploreCollections } from "@/app/api/explore/collections/route";
import type { ExplorePost } from "@/types/explore";
import type { PublicProviderCard } from "@/types/beautonomi";
import type {
  ExploreCollectionSummary,
  SavedProduct,
  WishlistSummary,
  WishlistsPageInitial,
} from "./wishlists-page-types";

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function unwrapArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && "data" in raw) {
    const inner = (raw as { data?: unknown }).data;
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}

export async function fetchWishlistsPageInitial(): Promise<WishlistsPageInitial | null> {
  const [reqWl, reqProv, reqProd, reqSaved, reqColl] = await Promise.all([
    createNextRequestFromHeaders("/api/me/wishlists"),
    createNextRequestFromHeaders("/api/me/wishlists/providers"),
    createNextRequestFromHeaders("/api/me/wishlists/products"),
    createNextRequestFromHeaders("/api/explore/saved?limit=50"),
    createNextRequestFromHeaders("/api/explore/collections"),
  ]);

  const [resWl, resProv, resProd, resSaved, resColl] = await Promise.all([
    getWishlists(reqWl),
    getWishlistProviders(reqProv),
    getWishlistProducts(reqProd),
    getExploreSaved(reqSaved),
    getExploreCollections(reqColl),
  ]);

  if (!resWl.ok && resWl.status === 401) return null;

  let wishlistError: string | null = null;
  let wishlists: WishlistSummary[] = [];
  if (resWl.ok) {
    const j = (await readJson(resWl)) as { data?: WishlistSummary[] };
    wishlists = Array.isArray(j?.data) ? j.data : [];
  } else {
    wishlistError = resWl.status === 408 ? "Request timed out. Please try again." : "Failed to load wishlists";
  }

  let savedProviders: PublicProviderCard[] = [];
  if (resProv.ok) {
    const j = (await readJson(resProv)) as { data?: PublicProviderCard[] };
    savedProviders = Array.isArray(j?.data) ? j.data : [];
  }

  let savedProducts: SavedProduct[] = [];
  if (resProd.ok) {
    const j = (await readJson(resProd)) as { data?: SavedProduct[] };
    savedProducts = Array.isArray(j?.data) ? j.data : [];
  }

  let savedPosts: ExplorePost[] = [];
  if (resSaved.ok) {
    const j = (await readJson(resSaved)) as { data?: unknown };
    const outer = j?.data;
    if (Array.isArray(outer)) {
      savedPosts = outer as ExplorePost[];
    } else if (outer && typeof outer === "object" && "data" in outer) {
      const inner = (outer as { data?: ExplorePost[] }).data;
      savedPosts = Array.isArray(inner) ? inner : [];
    }
  }

  let collections: ExploreCollectionSummary[] = [];
  if (resColl.ok) {
    const j = (await readJson(resColl)) as { data?: unknown };
    collections = unwrapArray<ExploreCollectionSummary>(j?.data);
  }

  return {
    wishlists,
    savedProviders,
    savedProducts,
    savedPosts,
    collections,
    wishlistError,
  };
}
