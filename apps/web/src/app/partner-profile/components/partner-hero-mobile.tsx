"use client";
import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Share2, Heart, MessageCircle, MapPin, Star, Check, ArrowLeft, Flag } from "lucide-react";
import ShareModal from "@/app/home/components/share-modal";
import LoginModal from "@/components/global/login-modal";
import { ReportProviderModal } from "@/components/report/ReportProviderModal";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  formatProviderDescriptionForProfilePreview,
  PROVIDER_GALLERY_OBJECT_POSITION,
} from "@beautonomi/utils";

interface PartnerHeroMobileProps {
  id?: string;
  slug?: string;
  businessName?: string;
  rating?: number;
  review_count?: number;
  city?: string;
  country?: string;
  is_featured?: boolean;
  is_verified?: boolean;
  gallery?: string[];
  description?: string | null;
  distance_km?: number | null;
  thumbnail_url?: string | null;
  owner_name?: string;
  business_type?: 'freelancer' | 'salon';
  supports_house_calls?: boolean;
  supports_salon?: boolean;
  current_badge?: { id: string; name: string; color?: string | null; description?: string | null; icon_url?: string | null } | null;
}

const PartnerHeroMobile: React.FC<PartnerHeroMobileProps> = ({
  id,
  slug,
  businessName,
  rating = 0,
  review_count = 0,
  city,
  country,
  is_featured,
  is_verified,
  gallery = [],
  description,
  distance_km,
  thumbnail_url,
  owner_name,
  business_type,
  supports_house_calls,
  supports_salon,
  current_badge,
}) => {
  const { user, session, isLoading: authLoading } = useAuth();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const profileDescription = formatProviderDescriptionForProfilePreview(description);

  // Use gallery images if available
  const displayImages = React.useMemo(() => {
    if (gallery && gallery.length > 0) {
      return gallery.map((url, idx) => ({ 
        src: url, 
        alt: `${businessName || 'Provider'} image ${idx + 1}` 
      }));
    }
    // Fallback to thumbnail
    if (thumbnail_url) {
      return [{ src: thumbnail_url, alt: `${businessName || 'Provider'} image` }];
    }
    return [];
  }, [gallery, thumbnail_url, businessName]);

  // Check if provider is in wishlist - optimized with caching for instant display
  useEffect(() => {
    const checkWishlist = async () => {
      if (authLoading) return;
      if (!user || !session || !id) {
        setIsInWishlist(false);
        return;
      }

      // Check cache first for instant display
      const cacheKey = `wishlist_${user.id}_${id}`;
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
          item_id: id,
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
    
    // Check immediately when user and id are available
    checkWishlist();
  }, [authLoading, session, user, id]);

  const toggleWishlist = async () => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    if (!id || isToggling) return;

    try {
      setIsToggling(true);
      const res = await fetcher.post<{ data: { success: boolean; action: "added" | "removed" } }>(
        "/api/me/wishlists/toggle",
        { item_type: "provider", item_id: id }
      );
      const action = res.data?.action;
      if (action === "added" || action === "removed") {
        const newState = action === "added";
        setIsInWishlist(newState);
        
        // Update cache immediately
        if (user && id && typeof window !== "undefined") {
          const cacheKey = `wishlist_${user.id}_${id}`;
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

  const nextImage = () => {
    if (displayImages.length > 0) {
      setCurrentImageIndex((prev) => (prev + 1) % displayImages.length);
    }
  };

  const prevImage = () => {
    if (displayImages.length > 0) {
      setCurrentImageIndex((prev) => (prev - 1 + displayImages.length) % displayImages.length);
    }
  };

  useEffect(() => {
    if (sliderRef.current && displayImages.length > 0) {
      sliderRef.current.scrollTo({
        left: currentImageIndex * sliderRef.current.offsetWidth,
        behavior: "smooth",
      });
    }
  }, [currentImageIndex, displayImages.length]);

  if (displayImages.length === 0) {
    return null;
  }

  return (
    <div className="md:hidden">
      {/* Hero Image Section — uniform 4:5 portrait crop */}
      <div className="relative z-0 w-full aspect-[4/5] overflow-hidden bg-gray-100">
        {/* Back Button - Top Left */}
        <Link
          href="/"
          className="absolute top-4 left-4 z-30 bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-lg hover:bg-white transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-gray-900" />
        </Link>
        {/* Image Slider */}
        <div
          ref={sliderRef}
          className="flex overflow-x-hidden scroll-smooth h-full"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {displayImages.map((image, index) => (
            <div key={index} className="min-w-full h-full relative">
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                style={{ objectPosition: PROVIDER_GALLERY_OBJECT_POSITION }}
                priority={index === 0}
                loading={index === 0 ? "eager" : "lazy"}
              />
            </div>
          ))}
        </div>

        {/* Navigation Arrows */}
        {displayImages.length > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg z-20"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5 text-gray-900" />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg z-20"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5 text-gray-900" />
            </button>
          </>
        )}

        {/* Bottom scrim — avatar + text legibility on photo */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-black/60 via-black/25 to-transparent"
          aria-hidden
        />

        {/* Avatar moved to info card below to avoid overlapping the card background */}

        {/* Photo Counter - Bottom Right */}
        {displayImages.length > 1 && (
          <div className="absolute bottom-6 right-4 z-20 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
            {currentImageIndex + 1}/{displayImages.length}
          </div>
        )}

        {/* Context Layer - Floating Tags/Badges - Top Left (below back button) */}
        <div className="absolute top-14 left-4 flex flex-col gap-2 z-20">
          {is_verified && (
            <div className="bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg">
              <div className="h-4 w-4 rounded-full bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600 flex items-center justify-center">
                <Check className="h-2.5 w-2.5 text-white stroke-[3]" />
              </div>
              <span className="text-xs font-medium text-gray-900">Verified</span>
            </div>
          )}
          {is_featured && (
            <div className="bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-full px-3 py-1.5 text-xs font-medium shadow-lg">
              ⭐ Featured
            </div>
          )}
          {supports_house_calls && (
            <div className="bg-green-500/90 backdrop-blur-sm text-white rounded-full px-3 py-1.5 text-xs font-medium shadow-lg">
              House Calls
            </div>
          )}
          {supports_salon && (
            <div className="bg-purple-500/90 backdrop-blur-sm text-white rounded-full px-3 py-1.5 text-xs font-medium shadow-lg">
              At Salon
            </div>
          )}
          {business_type === 'freelancer' && (
            <div className="bg-orange-500/90 backdrop-blur-sm text-white rounded-full px-3 py-1.5 text-xs font-medium shadow-lg">
              Freelancer
            </div>
          )}
        </div>

        {/* Floating Action Icons - Top Right */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
          {/* Heart Icon - Wishlist */}
          <button
            onClick={toggleWishlist}
            disabled={isToggling}
            className={`bg-white/90 backdrop-blur-sm rounded-full p-2.5 shadow-lg transition-all ${
              isInWishlist 
                ? "text-[#FF0077]" 
                : "text-gray-700 hover:text-[#FF0077]"
            } disabled:opacity-70`}
            aria-label={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Heart className={`h-5 w-5 transition-all ${isInWishlist ? "fill-[#FF0077] text-[#FF0077]" : "text-gray-600"}`} />
          </button>

          {/* Share Icon */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="bg-white/90 backdrop-blur-sm rounded-full p-2.5 shadow-lg text-gray-700 hover:text-gray-900 transition-colors"
            aria-label="Share profile"
          >
            <Share2 className="h-5 w-5" />
          </button>

          {/* Message Icon - Top Right (always visible, shows login modal if not logged in) */}
          {!authLoading && user && id ? (
            <Link
              href={`/account-settings/messages?provider=${id}`}
              className="bg-white/90 backdrop-blur-sm rounded-full p-2.5 shadow-lg text-gray-700 hover:text-gray-900 transition-colors"
              aria-label="Message provider"
            >
              <MessageCircle className="h-5 w-5" />
            </Link>
          ) : (
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="bg-white/90 backdrop-blur-sm rounded-full p-2.5 shadow-lg text-gray-700 hover:text-gray-900 transition-colors"
              aria-label="Message provider"
              disabled={authLoading}
            >
              <MessageCircle className="h-5 w-5" />
            </button>
          )}

          {/* Report Icon */}
          <button
            onClick={() => (user ? setIsReportModalOpen(true) : setIsLoginModalOpen(true))}
            className="bg-white/90 backdrop-blur-sm rounded-full p-2.5 shadow-lg text-gray-700 hover:text-amber-600 transition-colors"
            aria-label="Report provider"
          >
            <Flag className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Provider information — avatar straddles the gallery/card seam */}
      <div className="relative z-10 -mt-8 rounded-t-3xl bg-white pb-4 pt-[52px] shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
        {/* Avatar — top: -36px = half of 72px height, straddles the seam */}
        <div className="absolute -top-9 left-4 z-30">
          <div className="relative h-[72px] w-[72px] shrink-0">
            <div className="relative h-full w-full overflow-hidden rounded-full border-[3px] border-white bg-gray-200 shadow-xl ring-1 ring-black/10">
              {thumbnail_url ? (
                <Image
                  src={thumbnail_url}
                  alt={businessName ? `${businessName} profile photo` : "Provider profile photo"}
                  fill
                  sizes="72px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-300 to-gray-400">
                  <span className="text-xl font-bold text-white">
                    {(businessName || "P").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mb-4 px-4">
          <h1 className="text-2xl font-bold leading-tight text-gray-900 md:text-3xl">
            {businessName || "Provider"}
          </h1>
          {current_badge ? (
            <span
              className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: current_badge.color || "#6366f1" }}
              title={current_badge.description || current_badge.name}
            >
              {current_badge.icon_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current_badge.icon_url} alt="" className="w-4 h-4 object-contain flex-shrink-0" aria-hidden />
              )}
              {current_badge.name}
            </span>
          ) : null}
          <div className="mt-3 flex flex-col gap-1 mb-3">
            {(city || country) && (
              <div className="flex items-center gap-1 text-gray-600 text-sm">
                <MapPin className="h-4 w-4 text-gray-500" />
                <span>{[city, country].filter(Boolean).join(", ")}</span>
              </div>
            )}
            {owner_name && (
              <p className="text-sm text-gray-600">Work with {owner_name}</p>
            )}
          </div>

          {/* Rating and Reviews - Inline Style */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
              {rating > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${i < Math.round(rating) ? "fill-black text-black" : "fill-none text-gray-300"}`}
                    />
                  ))}
                </div>
                <span className="text-base font-semibold text-gray-900">
                  {rating.toFixed(2)}
                </span>
              </div>
            )}
            {review_count > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-700">
                  {review_count.toLocaleString()} {review_count === 1 ? "Review" : "Reviews"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Trust Module - Three Column Layout with Better Spacing */}
        <div className="flex items-center justify-between px-4 py-4 border-y border-gray-200 bg-gray-50/50">
          {/* Left: Distance */}
          <div className="flex flex-col items-center flex-1">
            <MapPin className="h-5 w-5 text-gray-500 mb-1.5" />
            <span className="text-xs text-gray-600 mb-0.5">Distance</span>
            <span className="text-sm font-semibold text-gray-900">
              {distance_km ? `${distance_km.toFixed(1)} km` : "—"}
            </span>
          </div>

          {/* Center: Rating */}
          <div className="flex flex-col items-center flex-1 border-x border-gray-200">
            <div className="flex items-center gap-1 mb-1.5">
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              <span className="text-base font-bold text-gray-900">
                {rating > 0 ? rating.toFixed(1) : "0.0"}
              </span>
            </div>
            <span className="text-xs text-gray-600">Rating</span>
          </div>

          {/* Right: Reviews */}
          <div className="flex flex-col items-center flex-1">
            <span className="text-base font-bold text-gray-900 mb-1.5">
              {review_count.toLocaleString()}
            </span>
            <span className="text-xs text-gray-600">
              {review_count === 1 ? "Review" : "Reviews"}
            </span>
          </div>
        </div>

        {/* What this provider offers - Bio/Description Section */}
        {profileDescription && (
          <div className="px-4 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">What this provider offers:</h2>
            <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">
              {profileDescription}
            </p>
          </div>
        )}
      </div>

      {id && (
        <ReportProviderModal
          open={isReportModalOpen}
          onOpenChange={setIsReportModalOpen}
          providerId={id}
          providerName={businessName || "Provider"}
        />
      )}
      {/* Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        experienceTitle={businessName || "Provider"}
        experienceImage={(() => {
          const raw = displayImages[0]?.src ?? thumbnail_url ?? (gallery?.[0] ?? null);
          return typeof raw === "string" ? raw : (raw as { src?: string })?.src ?? "/images/logo-beatonomi.svg";
        })()}
        shareUrl={
          typeof window !== "undefined" 
            ? slug 
              ? `${window.location.origin}/partner-profile?slug=${encodeURIComponent(slug)}`
              : window.location.href
            : undefined
        }
      />
      <LoginModal
        open={isLoginModalOpen}
        setOpen={setIsLoginModalOpen}
        initialMode="login"
      />
    </div>
  );
};

export default PartnerHeroMobile;
