"use client";
import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Share2, MapPin, Star, Heart, MessageSquare, Check, Flag } from "lucide-react";
import ShareModal from "@/app/home/components/share-modal";
import LoginModal from "@/components/global/login-modal";
import { ReportProviderModal } from "@/components/report/ReportProviderModal";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";

import Image1 from "./../../../../public/images/pexels-steinportraits-1898555.jpg";
import Image2 from "./../../../../public/images/pexels-rdne-7035446.jpg";
import Image4 from "./../../../../public/images/pexels-alipazani-2878375 - Copy (1).jpg";
import Image5 from "./../../../../public/images/pexels-cottonbro-3998404 (1).jpg";
import Image6 from "./../../../../public/images/pexels-rdne-6724431.jpg";

const images = [
  { src: Image1, alt: "Main Image" },
  { src: Image2, alt: "Image 1" },
  { src: Image6, alt: "Image 2" },
  { src: Image4, alt: "Image 3" },
  { src: Image5, alt: "Image 4" },
];

interface PartnerHeroProps {
  id?: string;
  slug?: string;
  businessName?: string;
  rating?: number;
  voteCount?: number;
  review_count?: number;
  location?: string;
  city?: string;
  country?: string;
  openingHours?: string;
  isOpen?: boolean;
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
}

const PartnerHero: React.FC<PartnerHeroProps> = ({
  id,
  slug,
  businessName,
  rating,
  voteCount,
  review_count,
  location,
  city,
  country,
  openingHours: _openingHours,
  isOpen: _isOpen,
  is_featured,
  is_verified,
  gallery,
  description,
  distance_km,
  thumbnail_url,
  owner_name,
  business_type,
  supports_house_calls,
  supports_salon,
}) => {
  const { user, isLoading: authLoading } = useAuth();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isMessageLoading, setIsMessageLoading] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Use gallery images if available, otherwise fallback to default images
  const displayImages = React.useMemo(() => {
    if (gallery && gallery.length > 0) {
      return gallery.map((url, idx) => ({ 
        src: url, 
        alt: `${businessName || 'Provider'} image ${idx + 1}` 
      }));
    }
    return images;
  }, [gallery, businessName]);
  
  const _displayLocation = location || (city && country ? `${city}, ${country}` : city || country || "");
  const displayVoteCount = voteCount || review_count || 0;

  // Check if provider is in wishlist - optimized with caching for instant display
  useEffect(() => {
    const checkWishlist = async () => {
      if (!user || !id) {
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
  }, [user, id]);

  const handleShareClick = () => {
    setIsShareModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsShareModalOpen(false);
  };

  const handleMessageClick = async () => {
    // Wait for auth to finish loading before checking
    if (authLoading) {
      toast.info("Please wait...");
      return;
    }
    
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    if (!id || isMessageLoading) return;

    try {
      setIsMessageLoading(true);
      
      // Optimize: Use Promise.race with timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Request timeout")), 5000)
      );
      
      // Check if conversation exists (with timeout)
      const conversationsPromise = fetcher.get<{ data: any[] }>("/api/me/conversations");
      const conversationsResponse = await Promise.race([conversationsPromise, timeoutPromise]);
      
      const conversations = conversationsResponse.data || [];
      const existingConv = conversations.find(
        (conv: any) => conv.provider_id === id && !conv.booking_id
      );

      if (existingConv) {
        // Navigate to messages page with existing conversation
        window.location.href = `/account-settings/messages?conversation=${existingConv.id}`;
      } else {
        // Create new conversation (with timeout)
        const createPromise = fetcher.post<{ data: { id: string; created: boolean } }>(
          "/api/me/conversations/create",
          { provider_id: id, booking_id: null }
        );
        const createResponse = await Promise.race([createPromise, timeoutPromise]);
        
        // Navigate to messages page with new conversation
        window.location.href = `/account-settings/messages?conversation=${createResponse.data.id}`;
      }
    } catch (err) {
      console.error("Error handling message:", err);
      // If timeout or error, still navigate to messages page - let the messages page handle conversation creation
      toast.error("Opening messages...");
      setTimeout(() => {
        window.location.href = `/account-settings/messages?provider=${id}`;
      }, 500);
    } finally {
      setIsMessageLoading(false);
    }
  };

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
    setCurrentImageIndex((prev) => (prev + 1) % displayImages.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + displayImages.length) % displayImages.length);
  };

  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.scrollTo({
        left: currentImageIndex * sliderRef.current.offsetWidth,
        behavior: "smooth",
      });
    }
  }, [currentImageIndex]);

  return (
    <div className="max-w-[2340px] mx-auto">
      {/* Breadcrumb Navigation */}
      <nav className="hidden md:flex px-4 md:px-10 py-4 text-sm">
        <ul className="flex items-center space-x-2 text-gray-500">
          <li>
            <Link href="/" className="hover:text-gray-700">
              Home
            </Link>
          </li>
          <li>•</li>
          <li>
            <Link href="/category/nail-salons" className="hover:text-gray-700">
              Nail Salons
            </Link>
          </li>
          <li>•</li>
          <li>
            <Link href="/location/cape-town" className="hover:text-gray-700">
              Cape Town
            </Link>
          </li>
          <li>•</li>
          <li>
            <Link href="/location/sea-point" className="hover:text-gray-700">
              Sea Point
            </Link>
          </li>
          <li>•</li>
          <li className="text-black font-medium">{businessName || "Provider"}</li>
        </ul>
      </nav>

      {/* Mobile Back Button */}
      <div className="flex md:hidden px-4 py-3 items-center">
        <Link href="/" className="flex items-center text-gray-600">
          <ChevronLeft className="h-5 w-5 mr-1" />
          <span className="text-sm">Go back</span>
        </Link>
      </div>

      {/* Image Gallery */}
      <div className="relative">
        {/* Desktop Gallery - Enhanced Grid with Squircle */}
        <div className="hidden md:grid grid-cols-2 gap-2 px-4 md:px-10">
          <div className="row-span-2">
            <Link href={slug ? `/partner-profile/gallery?slug=${encodeURIComponent(slug)}` : "/partner-profile/gallery"} className="relative block group">
              <Image
                src={displayImages[0]?.src || images[0].src}
                alt={displayImages[0]?.alt || images[0].alt}
                width={800}
                height={500}
                className="h-[500px] w-full squircle object-cover cursor-pointer group-hover:opacity-90 transition-opacity"
                style={{ width: "auto", height: "auto" }}
                loading="eager"
                priority
              />
              {/* Floating Tags on Main Image */}
              <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
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
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {displayImages.slice(1, 5).map((image, index) => (
              <Link key={index} href={slug ? `/partner-profile/gallery?slug=${encodeURIComponent(slug)}` : "/partner-profile/gallery"} className="relative block group">
                <Image
                  src={image.src}
                  alt={image.alt}
                  width={400}
                  height={245}
                  className="h-[245px] w-full squircle object-cover cursor-pointer group-hover:opacity-90 transition-opacity"
                  style={{ width: "auto", height: "auto" }}
                />
              </Link>
            ))}
          </div>
        </div>

        {/* Mobile Gallery */}
        <div className="relative md:hidden">
          <div
            ref={sliderRef}
            className="flex overflow-x-hidden scroll-smooth"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {displayImages.map((image, index) => (
              <div key={index} className="min-w-full">
                <Image
                  src={image.src}
                  alt={image.alt}
                  width={400}
                  height={300}
                  className="h-[300px] w-full object-cover"
                  style={{ width: "auto", height: "auto" }}
                  loading={index === 0 ? "eager" : "lazy"}
                  priority={index === 0}
                />
              </div>
            ))}
          </div>
          <button
            onClick={prevImage}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={nextImage}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow-lg"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
            {currentImageIndex + 1}/{displayImages.length}
          </div>
        </div>
      </div>

      {/* Provider Information Section - Enhanced Desktop Design */}
      <div className="relative px-4 md:px-10 -mt-8 md:-mt-12 bg-white rounded-t-3xl pt-8 md:pt-12 pb-6 md:pb-8 shadow-xl">
        {/* Floating Avatar - Breaks the hero image box */}
        <div className="absolute -top-12 left-10 z-10 hidden md:block">
          <div className="relative">
            <div className="relative w-24 h-24 rounded-full border-4 border-white overflow-hidden bg-gray-200 shadow-xl">
              {thumbnail_url ? (
                <Image
                  src={thumbnail_url}
                  alt={businessName || "Provider"}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-300 to-gray-400">
                  <span className="text-white font-bold text-2xl">
                    {(businessName || "P").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            {/* SuperPartner/Verified Badge */}
            {(is_verified || is_featured) && (
              <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-lg">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600 flex items-center justify-center">
                  <Check className="h-4 w-4 text-white stroke-[3]" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-6">
          <div className="flex-1">
            {/* Provider Name and Location */}
            <div className="mb-4">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2 leading-tight">
                {businessName || "Provider"}
              </h1>
              <div className="flex flex-col gap-1 mb-3">
                {(city || country) && (
                  <div className="flex items-center gap-1 text-gray-600 text-sm md:text-base">
                    <MapPin className="h-4 w-4 md:h-5 md:w-5 text-gray-500" />
                    <span>{[city, country].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {owner_name && (
                  <p className="text-sm md:text-base text-gray-600">Work with {owner_name}</p>
                )}
              </div>

              {/* Rating and Reviews - Inline Style */}
              <div className="flex items-center gap-4 mb-4 flex-wrap">
                {rating !== undefined && rating > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 md:h-5 md:w-5 fill-black text-black" />
                      ))}
                    </div>
                    <span className="text-lg md:text-xl font-semibold text-gray-900">
                      {rating.toFixed(2)}
                    </span>
                  </div>
                )}
                {displayVoteCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm md:text-base text-gray-700">
                      {displayVoteCount.toLocaleString()} {displayVoteCount === 1 ? "Review" : "Reviews"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Trust Module - Three Column Layout */}
            <div className="flex items-center justify-between py-4 border-y border-gray-200 bg-gray-50/50 rounded-lg px-4 mb-4">
              {/* Left: Distance */}
              <div className="flex flex-col items-center flex-1">
                <MapPin className="h-5 w-5 md:h-6 md:w-6 text-gray-500 mb-1.5" />
                <span className="text-xs text-gray-600 mb-0.5">Distance</span>
                <span className="text-sm md:text-base font-semibold text-gray-900">
                  {distance_km ? `${distance_km.toFixed(1)} km` : "—"}
                </span>
              </div>

              {/* Center: Rating */}
              <div className="flex flex-col items-center flex-1 border-x border-gray-200">
                <div className="flex items-center gap-1 mb-1.5">
                  <Star className="h-5 w-5 md:h-6 md:w-6 fill-yellow-400 text-yellow-400" />
                  <span className="text-base md:text-lg font-bold text-gray-900">
                    {rating && rating > 0 ? rating.toFixed(1) : "0.0"}
                  </span>
                </div>
                <span className="text-xs text-gray-600">Rating</span>
              </div>

              {/* Right: Reviews */}
              <div className="flex flex-col items-center flex-1">
                <span className="text-base md:text-lg font-bold text-gray-900 mb-1.5">
                  {displayVoteCount.toLocaleString()}
                </span>
                <span className="text-xs text-gray-600">
                  {displayVoteCount === 1 ? "Review" : "Reviews"}
                </span>
              </div>
            </div>

            {/* What this provider offers - Bio/Description Section */}
            {description && description.trim() && (
              <div className="py-4 border-b border-gray-200">
                <h2 className="text-sm md:text-base font-semibold text-gray-900 mb-2">What this provider offers:</h2>
                <p className="text-sm md:text-base text-gray-700 leading-relaxed line-clamp-3">
                  {description}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            <button
              onClick={handleMessageClick}
              disabled={isMessageLoading}
              className="group flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 rounded-xl bg-gradient-to-r from-[#FF0077] to-[#FF4DA6] text-white font-medium shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex-shrink-0 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {isMessageLoading ? (
                <>
                  <div className="h-4 w-4 md:h-5 md:w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="hidden md:inline text-sm">Opening...</span>
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 md:h-5 md:w-5 group-hover:scale-110 transition-transform" />
                  <span className="hidden md:inline text-sm font-semibold">Message</span>
                </>
              )}
            </button>
            <button
              onClick={toggleWishlist}
              disabled={isToggling}
              className={`group flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 rounded-xl border-2 transition-all duration-200 flex-shrink-0 disabled:opacity-70 disabled:cursor-not-allowed ${
                isInWishlist 
                  ? "bg-gradient-to-r from-pink-50 to-rose-50 border-[#FF0077] text-[#FF0077] shadow-md hover:shadow-lg" 
                  : "bg-white border-gray-200 text-gray-700 hover:border-[#FF0077] hover:text-[#FF0077] hover:bg-pink-50"
              }`}
            >
              <Heart className={`h-4 w-4 md:h-5 md:w-5 transition-all ${isInWishlist ? "fill-[#FF0077] text-[#FF0077] scale-110" : "text-gray-600 group-hover:text-[#FF0077] group-hover:scale-110"}`} />
              <span className="hidden md:inline text-sm font-medium">Save</span>
            </button>
            <button
              onClick={handleShareClick}
              className="group flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 rounded-xl bg-white border-2 border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all duration-200 flex-shrink-0 shadow-sm hover:shadow-md"
            >
              <Share2 className="h-4 w-4 md:h-5 md:w-5 group-hover:scale-110 transition-transform" />
              <span className="hidden md:inline text-sm font-medium">Share</span>
            </button>
            <button
              type="button"
              onClick={() => (user ? setIsReportModalOpen(true) : setIsLoginModalOpen(true))}
              className="group flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 rounded-xl bg-white border-2 border-gray-200 text-gray-600 hover:border-amber-200 hover:bg-amber-50 transition-all duration-200 flex-shrink-0 shadow-sm hover:shadow-md"
              title="Report this provider"
            >
              <Flag className="h-4 w-4 md:h-5 md:w-5 group-hover:scale-110 transition-transform" />
              <span className="hidden md:inline text-sm font-medium">Report</span>
            </button>
          </div>
        </div>
      </div>

      {id && (
        <ReportProviderModal
          open={isReportModalOpen}
          onOpenChange={setIsReportModalOpen}
          providerId={id}
          providerName={businessName || "Provider"}
        />
      )}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={handleCloseModal}
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
      <LoginModal open={isLoginModalOpen} setOpen={setIsLoginModalOpen} />
    </div>
  );
};

export default PartnerHero;
