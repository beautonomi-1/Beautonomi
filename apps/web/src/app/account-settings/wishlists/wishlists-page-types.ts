import type { PublicProviderCard } from "@/types/beautonomi";
import type { ExplorePost } from "@/types/explore";

export type ExploreCollectionSummary = {
  id: string;
  name: string;
  slug: string;
  post_count: number;
};

export type WishlistSummary = {
  id: string;
  name: string;
  is_default: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  item_count: number;
  cover_images: string[];
};

export type SavedProduct = {
  id: string;
  name: string;
  brand?: string | null;
  image_urls: string[];
  retail_price: number;
  currency: string;
  in_stock: boolean;
  added_at: string;
  provider: {
    id: string;
    business_name: string;
    slug: string;
    logo_url?: string | null;
  };
};

export type WishlistsPageInitial = {
  wishlists: WishlistSummary[];
  savedProviders: PublicProviderCard[];
  savedProducts: SavedProduct[];
  savedPosts: ExplorePost[];
  collections: ExploreCollectionSummary[];
  /** Up to four image URLs for the wishlists hub “Recently viewed” preview tile */
  recentlyViewedThumbnails: string[];
  wishlistError: string | null;
};
