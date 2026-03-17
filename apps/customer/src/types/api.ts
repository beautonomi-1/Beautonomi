/**
 * API response types for customer app - aligned with Next.js backend
 */

/** Gamification badge (from provider_points). */
export interface ProviderBadge {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  color?: string | null;
}

export interface PublicProviderCard {
  id: string;
  slug: string;
  business_name: string;
  business_type: "freelancer" | "salon";
  rating: number;
  review_count: number;
  thumbnail_url: string | null;
  /** Business "face" for the small circle on the card; falls back to thumbnail if not set. */
  avatar_url?: string | null;
  city: string;
  country: string;
  is_featured: boolean;
  is_verified: boolean;
  starting_price?: number;
  currency: string;
  description?: string | null;
  distance_km?: number | null;
  supports_house_calls?: boolean;
  supports_salon?: boolean;
  /** Points/gamification badge (aligned with web). */
  current_badge?: ProviderBadge | null;
  /** True when provider is in a sponsored slot (aligned with web). */
  is_sponsored?: boolean;
  /** Campaign id for ad attribution (click/book events). */
  campaign_id?: string | null;
}

export interface ProviderLocation {
  id: string;
  name: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  country: string;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  /** 'salon' = clients can visit; 'base' = distance/travel only (mobile-only) */
  location_type?: "salon" | "base";
}

export interface PublicProviderDetail {
  id: string;
  slug: string;
  business_name: string;
  business_type: "freelancer" | "salon";
  rating: number;
  review_count: number;
  thumbnail_url: string | null;
  avatar_url?: string | null;
  city: string;
  country: string;
  is_featured: boolean;
  is_verified: boolean;
  starting_price?: number;
  currency: string;
  description: string;
  gallery: ({ src: string; alt?: string } | string)[];
  categories: string[];
  supports_house_calls: boolean;
  supports_salon: boolean;
  distance_km?: number | null;
  locations: ProviderLocation[];
  staff_count?: number;
  years_in_business?: number | null;
  accepts_custom_requests?: boolean;
  website?: string | null;
  response_rate?: number;
  response_time_hours?: number;
  languages_spoken?: string[];
  policies?: {
    cancellation_window_hours?: number;
    requires_deposit?: boolean;
    deposit_percentage?: number;
    no_show_fee_enabled?: boolean;
    no_show_fee_amount?: number;
    currency?: string;
  };
}

export interface ProviderService {
  id: string;
  title: string;
  description?: string | null;
  price: number;
  duration_minutes: number;
  currency: string;
  supports_at_home: boolean;
  supports_at_salon: boolean;
  has_variants: boolean;
  variants?: {
    id: string;
    title: string;
    variant_name?: string;
    price: number;
    duration_minutes: number;
  }[];
}

export interface ProviderServicesResponse {
  provider: { id: string; business_name: string; slug: string };
  categories: {
    id: string;
    name: string;
    color?: string | null;
    services: ProviderService[];
  }[];
  total_services: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  specialties?: string[];
}

export interface AvailabilitySlot {
  start: string;
  end: string;
}

export interface ExplorePost {
  id: string;
  provider_id?: string;
  provider: { business_name: string; slug?: string };
  caption: string | null;
  media_urls: string[];
  like_count: number;
  comment_count?: number;
  published_at?: string;
  is_saved?: boolean;
  is_liked?: boolean;
  tags?: string[];
  /** When set, "Book this look" links to this offering */
  offering_id?: string | null;
  offering?: { id: string; name: string; price?: number; duration_minutes?: number } | null;
}

export interface ExploreComment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author?: { full_name?: string | null; avatar_url?: string | null };
}

export interface BookingServiceDetail {
  id: string;
  offering_id: string;
  offering_name: string;
  staff_id: string | null;
  staff_name: string | null;
  duration_minutes: number;
  price: number;
  guest_name?: string;
}

export interface Booking {
  id: string;
  booking_number: string;
  status: string;
  location_type: "at_home" | "at_salon";
  scheduled_at: string;
  services?: BookingServiceDetail[];
  total_amount: number;
  currency: string;
  provider_name?: string;
  /** When true, this booking is part of a group; group_booking_ref is the shared ref (e.g. GB-xxx). */
  is_group_booking?: boolean;
  group_booking_ref?: string | null;
}

export interface HomeApiResponse {
  topRated: PublicProviderCard[];
  /** Sponsored/boosted listings (when ads module enabled). Aligned with web. */
  sponsored?: PublicProviderCard[];
  nearest: PublicProviderCard[];
  hottest: PublicProviderCard[];
  upcoming: PublicProviderCard[];
}

export interface SearchResult {
  providers: PublicProviderCard[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  subcategories?: { id: string; slug: string; name: string }[];
}

export interface SavedPaymentMethod {
  id: string;
  type: string;
  provider?: string;
  card_type?: string;
  last4?: string;
  expiry_month?: number;
  expiry_year?: number;
  cardholder_name?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

/** Product variant from GET /api/public/providers/[slug]/products or /api/public/products/[id] */
export interface PublicProductVariant {
  id: string;
  option_values?: Record<string, string>;
  retail_price: number;
  quantity: number;
  sku?: string | null;
  image_url?: string | null;
}

/** Product from GET /api/public/providers/[slug]/products (list) */
export interface PublicProviderProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  inStock: boolean;
  quantity: number;
  track_stock_quantity?: boolean;
  hasVariants: boolean;
  variantOptionTypes?: { name: string; values: string[] }[];
  variants: PublicProductVariant[];
}

/** Cart item from GET /api/me/cart */
export interface CartItem {
  id: string;
  quantity: number;
  effective_price: number;
  in_stock: boolean;
  stock_available: number;
  product_variant_id?: string | null;
  product_variant?: { id: string; retail_price: number; quantity: number; option_values?: Record<string, string> } | null;
  product: {
    id: string;
    name: string;
    retail_price: number;
    image_urls?: string[] | null;
    brand?: string | null;
    quantity: number;
    has_variants?: boolean;
  };
  provider: { id: string; business_name: string; slug: string };
}
