"use client";
import React from "react";
import Image from "next/image";
import { FaStar } from "react-icons/fa";
import { Heart, Check } from "lucide-react";
import Link from "next/link";
import type { PublicProviderCard } from "@/types/beautonomi";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import { toast } from "sonner";

interface ProviderCardProps {
  provider: PublicProviderCard;
  showTopRatedBadge?: boolean;
  showHottestBadge?: boolean;
  showNearestBadge?: boolean;
  showUpcomingTalentBadge?: boolean;
  isInWishlistProp?: boolean; // Allow parent to pass wishlist status
}

/**
 * ProviderCard Component
 * 
 * Displays a provider card with image, name, rating, price, and location.
 * Used in homepage sections.
 */
const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  showTopRatedBadge = false,
  showHottestBadge = false,
  showNearestBadge = false,
  showUpcomingTalentBadge = false,
  isInWishlistProp,
}) => {
  const { user } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = React.useState(false);
  const [isToggling, setIsToggling] = React.useState(false);
  const [isInWishlist, setIsInWishlist] = React.useState(isInWishlistProp ?? false);

  const formatReviewCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  const formatDescription = (description: string) => {
    if (!description) return "";
    // Convert to lowercase and capitalize first letter
    const trimmed = description.trim();
    if (trimmed.length === 0) return "";
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  };

  // Card hero = main listing image; circle = business "face" (avatar), fallback to thumbnail
  const thumbnailUrl = provider.thumbnail_url || "/images/placeholder-provider.jpg";
  const avatarUrl = provider.avatar_url || provider.thumbnail_url || "/images/placeholder-provider.jpg";
  const providerInitial = provider.business_name.charAt(0).toUpperCase();
  const businessName = provider.business_name.trim() || "Provider";
  const ratingText = provider.rating > 0 ? `${provider.rating.toFixed(1)} out of 5` : "No reviews yet";
  const reviewCountText = provider.review_count ? `${formatReviewCount(provider.review_count)} reviews` : "No reviews";

  // Check if provider is in wishlist - optimized with caching for instant display
  // Skip check if isInWishlistProp is explicitly provided (e.g., from wishlist page)
  React.useEffect(() => {
    // If parent explicitly passed wishlist status, use it and skip API check
    if (isInWishlistProp !== undefined) {
      setIsInWishlist(isInWishlistProp);
      return;
    }

    const checkWishlist = async () => {
      if (!user || !provider.id) {
        setIsInWishlist(false);
        return;
      }

      // Check cache first for instant display
      const cacheKey = `wishlist_${user.id}_${provider.id}`;
      const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
      if (cached !== null) {
        setIsInWishlist(cached === "true");
      }

      try {
        // Use the optimized check endpoint - single API call
        const response = await fetcher.post<{ 
          data: { is_in_wishlist: boolean; wishlist_id?: string | null } 
        }>("/api/me/wishlists/check", {
          item_type: "provider",
          item_id: provider.id,
        });
        
        const isInWishlist = response.data?.is_in_wishlist || false;
        setIsInWishlist(isInWishlist);
        
        // Cache the result for instant display on next visit
        if (typeof window !== "undefined") {
          localStorage.setItem(cacheKey, String(isInWishlist));
        }
      } catch {
        // Silently fail - wishlist check is optional
        // Keep cached value if available, otherwise set to false
        if (cached === null) {
          setIsInWishlist(false);
        }
      }
    };
    
    // Check immediately when user and provider.id are available
    checkWishlist();
  }, [user, provider.id, isInWishlistProp]);

  const toggleWishlist = async () => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    try {
      setIsToggling(true);
      const res = await fetcher.post<{ data: { action: "added" | "removed" } }>(
        "/api/me/wishlists/toggle",
        { item_type: "provider", item_id: provider.id }
      );
      const action = res.data?.action;
      if (action === "added" || action === "removed") {
        const newState = action === "added";
        setIsInWishlist(newState);
        
        // Update cache immediately
        if (user && provider.id && typeof window !== "undefined") {
          const cacheKey = `wishlist_${user.id}_${provider.id}`;
          localStorage.setItem(cacheKey, String(newState));
        }
        
        toast.success(action === "added" ? "Saved to wishlist" : "Removed from wishlist");
      }
    } catch (err) {
      const msg = err instanceof FetchError ? err.message : "Failed to update wishlist";
      toast.error(msg);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <Link
      href={`/partner-profile?slug=${encodeURIComponent(provider.slug)}`}
      className="block"
      prefetch={false}
      aria-label={`View ${businessName}, ${ratingText}, ${reviewCountText}`}
    >
      <article className="w-full cursor-pointer group" aria-labelledby={`provider-name-${provider.id}`}>
        {/* Image Container - card hero (main listing image) */}
        <div className="relative w-full h-40 md:h-64 squircle overflow-hidden mb-2 md:mb-3" role="img" aria-label={`${businessName} listing photo`}>
          <Image
            src={thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            loading="eager"
            priority
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/images/placeholder-provider.jpg";
            }}
          />
          
          {/* Badges Container - Top Left */}
          <div className="absolute top-2 left-2 md:top-3 md:left-3 flex flex-col gap-1.5 md:gap-2 z-10" role="list" aria-label="Listing badges">
            {showTopRatedBadge && (
              <span className="bg-[#FF0077] text-white text-[10px] md:text-xs font-medium px-2 md:px-3 py-1 rounded-full inline-block" role="listitem">Top Rated</span>
            )}
            {showHottestBadge && (
              <span className="bg-orange-600 text-white text-[10px] md:text-xs font-medium px-2 md:px-3 py-1 rounded-full inline-block" role="listitem">Hottest</span>
            )}
            {showNearestBadge && (
              <span className="bg-blue-600 text-white text-[10px] md:text-xs font-medium px-2 md:px-3 py-1 rounded-full inline-block" role="listitem">Nearest</span>
            )}
            {showUpcomingTalentBadge && (
              <span className="bg-purple-600 text-white text-[10px] md:text-xs font-medium px-2 md:px-3 py-1 rounded-full inline-block" role="listitem">Rising Star</span>
            )}
            {provider.business_type === 'freelancer' && (
              <span className="bg-orange-500 text-white text-[10px] md:text-xs font-medium px-2 md:px-3 py-1 rounded-full inline-block" role="listitem">Freelancer</span>
            )}
            {provider.supports_house_calls === true && (
              <span className="bg-green-500 text-white text-[10px] md:text-xs font-medium px-2 md:px-3 py-1 rounded-full inline-block" role="listitem">House Calls</span>
            )}
            {provider.supports_salon === true && (
              <span className="bg-purple-500 text-white text-[10px] md:text-xs font-medium px-2 md:px-3 py-1 rounded-full inline-block" role="listitem">At Salon</span>
            )}
            {provider.current_badge && (
              <span
                className="text-white text-[10px] md:text-xs font-medium px-2 md:px-3 py-1 rounded-full inline-block shadow-md"
                style={{ background: provider.current_badge.color || '#6366f1', border: '1px solid rgba(255, 255, 255, 0.3)' }}
                role="listitem"
                title={provider.current_badge.description || provider.current_badge.name}
                aria-label={provider.current_badge.name}
              >
                {provider.current_badge.name}
              </span>
            )}
            {provider.is_sponsored && (
              <span className="bg-amber-600 text-white text-[10px] md:text-xs font-medium px-2 md:px-3 py-1 rounded-full inline-block" role="listitem">Sponsored</span>
            )}
          </div>

          {/* Wishlist - Top Right */}
          <button
            type="button"
            className={`absolute top-2 right-2 md:top-3 md:right-3 bg-white rounded-full p-1.5 md:p-2 hover:bg-gray-100 transition-colors z-10 ${isToggling ? "opacity-70 cursor-not-allowed" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isToggling) return;
              toggleWishlist();
            }}
            disabled={isToggling}
            aria-label={isInWishlist ? `Remove ${businessName} from wishlist` : `Add ${businessName} to wishlist`}
            aria-pressed={isInWishlist}
          >
            <Heart className={`h-4 w-4 md:h-5 md:w-5 transition-all ${isInWishlist ? "fill-[#FF0077] text-[#FF0077]" : "text-gray-600"}`} aria-hidden />
          </button>

          {/* Business avatar (face of the business) - Bottom Left */}
          <div className="absolute bottom-2 left-2 md:bottom-3 md:left-3" aria-hidden>
            <div className="relative w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-white overflow-hidden bg-gray-200">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-300">
                  <span className="text-white font-semibold text-xs">{providerInitial}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-2 md:px-0.5">
          <div className="flex items-center gap-0.5 mb-1.5 md:mb-1">
            <h3 id={`provider-name-${provider.id}`} className="font-semibold text-sm md:text-base line-clamp-1">
              {businessName}
            </h3>
            {provider.is_verified && (
              <span
                className="relative flex-shrink-0 group inline-flex items-center justify-center"
                title="Verified Beautonomi Provider"
                aria-label="Verified provider"
              >
                {/* Gold checkmark badge - LinkedIn/Twitter inspired */}
                <div className="relative inline-flex items-center justify-center">
                  {/* Subtle outer glow */}
                  <div 
                    className="absolute inset-0 rounded-full opacity-30 blur-[2px]"
                    style={{
                      background: 'radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, transparent 70%)',
                      transform: 'scale(1.4)',
                    }}
                  />
                  
                  {/* Main badge container - Gold circular background */}
                  <div 
                    className="relative h-4 w-4 md:h-[18px] md:w-[18px] rounded-full bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600 flex items-center justify-center transition-all duration-200 group-hover:scale-110 shadow-sm"
                    style={{
                      boxShadow: '0 1px 3px rgba(245, 158, 11, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                    }}
                  >
                    {/* White checkmark icon - Clean and simple like LinkedIn/Twitter */}
                    <Check 
                      className="h-2.5 w-2.5 md:h-3 md:w-3 text-white stroke-[3] flex-shrink-0" 
                      aria-hidden="true"
                    />
                    
                    {/* Inner highlight for depth */}
                    <div 
                      className="absolute top-0 left-0 w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-white/50 blur-[0.5px] pointer-events-none"
                      style={{
                        transform: 'translate(15%, 15%)',
                      }}
                    />
                  </div>
                </div>
              </span>
            )}
          </div>

          {/* Rating */}
          <div className="flex items-center gap-1 md:gap-1.5 mb-1.5 md:mb-1" aria-label={`Rating: ${ratingText}, ${reviewCountText}`}>
            <FaStar className="text-yellow-400 flex-shrink-0 w-3.5 h-3.5 md:w-4 md:h-4" aria-hidden />
            <span className="text-xs md:text-sm font-medium leading-tight">
              {provider.rating > 0 ? provider.rating.toFixed(1) : "0.0"}
            </span>
            <span className="text-xs md:text-sm text-gray-500 leading-tight">
              ({formatReviewCount(provider.review_count || 0)})
            </span>
          </div>

          {/* Description */}
          {provider.description && provider.description.trim() && (
            <p 
              className="text-[10px] md:text-xs text-gray-600 font-light mb-2 md:mb-2.5 leading-relaxed normal-case line-clamp-2"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {formatDescription(provider.description)}
            </p>
          )}

          {provider.distance_km != null && (
            <p className="text-xs md:text-sm text-gray-500 whitespace-nowrap flex-shrink-0 mt-1" aria-label={`${provider.distance_km.toFixed(0)} kilometers away`}>
              {provider.distance_km.toFixed(0)} KM Away
            </p>
          )}
        </div>
      </article>
      <LoginModal open={isLoginModalOpen} setOpen={setIsLoginModalOpen} />
    </Link>
  );
};

export default ProviderCard;
