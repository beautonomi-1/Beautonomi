"use client";
import React from "react";
import Image from "next/image";
import { FaStar } from "react-icons/fa";
import { Heart, Check, MapPin } from "lucide-react";
import Link from "next/link";
import type { PublicProviderCard } from "@/types/beautonomi";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import { toast } from "sonner";
import { formatProviderDescriptionForCard } from "@beautonomi/utils";
import {
  providerAvatarImage,
  providerHeroImageCandidates,
} from "@/lib/provider-images";

interface ProviderCardProps {
  provider: PublicProviderCard;
  showTopRatedBadge?: boolean;
  showHottestBadge?: boolean;
  showNearestBadge?: boolean;
  showUpcomingTalentBadge?: boolean;
  /** Label for sponsored/boosted cards (from Control Plane → Ads `disclosure_label`). */
  sponsoredBadgeText?: string;
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
  sponsoredBadgeText = "Sponsored",
  isInWishlistProp,
}) => {
  const { user, session, isLoading: authLoading } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = React.useState(false);
  const [isToggling, setIsToggling] = React.useState(false);
  const [isInWishlist, setIsInWishlist] = React.useState(isInWishlistProp ?? false);

  const formatReviewCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  // Card hero = main listing image (thumbnail → avatar → bundled SVG fallback).
  // Avatar circle = business "face"; when nothing usable exists we render
  // initials instead of hitting a missing placeholder image. The previous
  // hardcoded `/images/placeholder-provider.jpg` did not exist in `public/`,
  // which spammed Next/Image 404s for any provider missing a thumbnail.
  const heroCandidates = React.useMemo(
    () => providerHeroImageCandidates(provider),
    [provider.thumbnail_url, provider.avatar_url],
  );
  const thumbnailUrl = heroCandidates[0];
  const avatarUrl = providerAvatarImage(provider);
  const [avatarBroken, setAvatarBroken] = React.useState(false);
  const [thumbnailSrc, setThumbnailSrc] = React.useState<string>(thumbnailUrl);
  React.useEffect(() => {
    setThumbnailSrc(thumbnailUrl);
    setAvatarBroken(false);
  }, [thumbnailUrl, avatarUrl]);
  const providerInitial = provider.business_name.charAt(0).toUpperCase();
  const businessName = provider.business_name.trim() || "Provider";
  const cardDescription = formatProviderDescriptionForCard(provider.description);
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
      if (authLoading) return;
      if (!user || !session || !provider.id) {
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
  }, [authLoading, session, user, provider.id, isInWishlistProp]);

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

  const handleClick = () => {
    if (provider.is_sponsored && provider.campaign_id) {
      fetcher.post("/api/public/ads/event", {
        event_type: "click",
        campaign_id: provider.campaign_id,
        provider_id: provider.id,
        idempotency_key: `web-click:${provider.campaign_id}:${provider.id}:${Date.now()}`,
      }).catch(() => {});
    }
  };

  const providerLookup = (provider.slug || "").trim() || provider.id;
  const profileParams = new URLSearchParams({ slug: providerLookup });
  if (provider.id) profileParams.set("provider_id", provider.id);
  if (provider.is_sponsored && provider.campaign_id) profileParams.set("campaign_id", provider.campaign_id);
  const profileHref = `/partner-profile?${profileParams.toString()}`;

  return (
    <Link
      href={profileHref}
      className="block"
      onClick={handleClick}
      aria-label={`View ${businessName}, ${ratingText}, ${reviewCountText}`}
    >
      <article className="w-full cursor-pointer group" aria-labelledby={`provider-name-${provider.id}`}>
        {/* Image Container - card hero (main listing image) */}
        <div className="relative w-full h-40 md:h-64 squircle overflow-hidden mb-2 md:mb-3" role="img" aria-label={`${businessName} listing photo`}>
          <Image
            src={thumbnailSrc}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            loading="eager"
            priority
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => {
              // Try thumbnail → avatar → bundled fallback. A few providers
              // have stale `thumbnail_url` values while their `avatar_url`
              // still loads fine (matching the customer app card).
              const currentIndex = heroCandidates.indexOf(thumbnailSrc);
              const nextSrc = heroCandidates[currentIndex + 1];
              if (nextSrc) setThumbnailSrc(nextSrc);
            }}
          />
          
          {/* Badges Container - Top Left.
              Priority: sponsored/ad-disclosure FIRST, then earned provider tier badge,
              then contextual section badge, then capability badges.
              Overflow beyond 3 is collapsed into a "+N more" pill so the stack
              never grows taller than the image on small cards. */}
          {(() => {
            const MAX_VISIBLE = 3;
            const badges: Array<{ key: string; label: string; style?: React.CSSProperties; className: string; title?: string; iconUrl?: string }> = [];
            if (provider.is_sponsored) {
              badges.push({ key: "spon", label: sponsoredBadgeText, className: "bg-amber-600" });
            }
            if (provider.current_badge) {
              badges.push({
                key: "badge",
                label: provider.current_badge.name,
                className: "shadow-md",
                style: { background: provider.current_badge.color || "#6366f1", border: "1px solid rgba(255,255,255,0.3)" },
                title: (provider.current_badge as { description?: string }).description || provider.current_badge.name,
                iconUrl: provider.current_badge.icon_url ?? undefined,
              });
            }
            if (showTopRatedBadge) badges.push({ key: "top", label: "Top Rated", className: "bg-[#FF0077]" });
            if (showHottestBadge) badges.push({ key: "hot", label: "Hottest", className: "bg-orange-600" });
            if (showNearestBadge) badges.push({ key: "near", label: "Nearest", className: "bg-blue-600" });
            if (showUpcomingTalentBadge) badges.push({ key: "up", label: "Rising Star", className: "bg-purple-600" });
            if (provider.business_type === "freelancer") badges.push({ key: "free", label: "Freelancer", className: "bg-orange-500" });
            if (provider.supports_house_calls) badges.push({ key: "house", label: "House Calls", className: "bg-green-500" });
            if (provider.supports_salon) badges.push({ key: "salon", label: "At Salon", className: "bg-purple-500" });

            const visible = badges.slice(0, MAX_VISIBLE);
            const overflow = badges.length - MAX_VISIBLE;

            return (
              <div className="absolute top-2 left-2 md:top-3 md:left-3 flex flex-col gap-1.5 md:gap-2 z-10" role="list" aria-label="Listing badges">
                {visible.map((b) => (
                  <span
                    key={b.key}
                    className={`text-white text-[11px] md:text-xs font-semibold px-2 md:px-3 py-1 rounded-full inline-flex items-center gap-1 ${b.className}`}
                    style={b.style}
                    role="listitem"
                    title={b.title}
                    aria-label={b.title || b.label}
                  >
                    {b.iconUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.iconUrl} alt="" className="w-3 h-3 object-contain flex-shrink-0" aria-hidden />
                    )}
                    {b.label}
                  </span>
                ))}
                {overflow > 0 && (
                  <span
                    className="text-white text-[11px] md:text-xs font-semibold px-2 md:px-3 py-1 rounded-full inline-block bg-black/55"
                    role="listitem"
                    aria-label={`${overflow} more badges`}
                  >
                    +{overflow} more
                  </span>
                )}
              </div>
            );
          })()}

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
              {avatarUrl && !avatarBroken ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                  onError={() => setAvatarBroken(true)}
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
          {cardDescription && (
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
              {cardDescription}
            </p>
          )}

          {provider.distance_km != null && (
            <p
              className="mt-1 inline-flex items-center gap-1.5 whitespace-nowrap text-xs md:text-sm font-medium text-gray-600"
              aria-label={`${provider.distance_km.toFixed(1)} kilometers away`}
            >
              <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4 text-gray-500" aria-hidden />
              {provider.distance_km.toFixed(1)} km away
            </p>
          )}
        </div>
      </article>
      <LoginModal
        open={isLoginModalOpen}
        setOpen={setIsLoginModalOpen}
        initialMode="login"
      />
    </Link>
  );
};

export default ProviderCard;
