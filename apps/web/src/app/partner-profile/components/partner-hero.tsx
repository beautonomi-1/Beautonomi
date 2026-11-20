"use client";
import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Share2, Star, Heart, MessageSquare, Flag } from "lucide-react";
import ShareModal from "@/app/home/components/share-modal";
import LoginModal from "@/components/global/login-modal";
import { ReportProviderModal } from "@/components/report/ReportProviderModal";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { formatProviderDescriptionForProfilePreview } from "@beautonomi/utils";
import { ProviderGalleryImage } from "@beautonomi/ui/web";
import { usePartnerProfileT } from "@/lib/i18n/use-partner-profile-t";
import { translatePublicCategory } from "@/lib/i18n/translate-public-category";
import { ApproxMoneyLabel } from "@/components/i18n/ApproxMoneyLabel";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { ViewerTier } from "@/lib/providers/provider-disclosure";
import { formatPartnerProfileOpenLabel } from "@/lib/providers/format-partner-profile-open-label";

interface PartnerHeroProps {
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
  avatar_url?: string | null;
  owner_name?: string;
  business_type?: "freelancer" | "salon";
  supports_house_calls?: boolean;
  supports_salon?: boolean;
  current_badge?: {
    id: string;
    name: string;
    color?: string | null;
    description?: string | null;
    icon_url?: string | null;
  } | null;
  categories?: string[];
  starting_price?: number;
  currency?: string;
  operating_hours?: unknown;
  timezone?: string | null;
  disclosureTier?: ViewerTier;
  onBook?: () => void;
  onOpenPhoto?: (index: number) => void;
  onOpenAllPhotos?: () => void;
}

const MOSAIC_HEIGHT = "h-[240px] lg:h-[280px] xl:h-[320px]";

const PartnerHero: React.FC<PartnerHeroProps> = ({
  id,
  slug,
  businessName,
  rating,
  review_count,
  city,
  country,
  is_featured,
  is_verified,
  gallery,
  description,
  distance_km,
  thumbnail_url,
  avatar_url,
  owner_name,
  business_type,
  supports_house_calls,
  supports_salon,
  current_badge,
  categories = [],
  starting_price,
  currency,
  operating_hours,
  timezone,
  disclosureTier = "anon",
  onBook,
  onOpenPhoto,
  onOpenAllPhotos,
}) => {
  const { user, session, isLoading: authLoading } = useAuth();
  const { t, pp } = usePartnerProfileT();
  const { language } = useLocale();
  const providerFallback = pp("providerFallback");
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isMessageLoading, setIsMessageLoading] = useState(false);
  const profileDescription = formatProviderDescriptionForProfilePreview(description);

  const mosaicImages = useMemo(() => {
    return (gallery ?? [])
      .map((url) => (typeof url === "string" ? url.trim() : ""))
      .filter((url) => url.length > 0)
      .map((url, idx) => ({
        src: url,
        alt: `${businessName || "Provider"} image ${idx + 1}`,
      }));
  }, [gallery, businessName]);

  const faceUrl = (avatar_url?.trim() || thumbnail_url?.trim()) ?? null;
  const displayVoteCount = review_count ?? 0;

  const openStatusLabel = useMemo(() => {
    if (disclosureTier === "anon") return null;
    return formatPartnerProfileOpenLabel(operating_hours, timezone, pp);
  }, [disclosureTier, operating_hours, timezone, pp]);

  const subtitleParts = useMemo(() => {
    const parts: string[] = [];
    for (const raw of categories.slice(0, 2)) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const name = translatePublicCategory(t, trimmed.replace(/\s+/g, "-"), trimmed, { language });
      if (!name || name === t("web.layout.header.allCategories")) continue;
      parts.push(name);
    }
    if (business_type === "freelancer") parts.push(pp("tagFreelancer"));
    if (supports_salon) parts.push(pp("atTheSalon"));
    if (supports_house_calls) parts.push(pp("tagHouseCalls"));
    return parts.slice(0, 4);
  }, [
    categories,
    business_type,
    supports_salon,
    supports_house_calls,
    t,
    language,
    pp,
  ]);

  useEffect(() => {
    const checkWishlist = async () => {
      if (authLoading) return;
      if (!user || !session || !id) {
        setIsInWishlist(false);
        return;
      }

      const cacheKey = `wishlist_${user.id}_${id}`;
      const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
      if (cached !== null) {
        setIsInWishlist(cached === "true");
      }

      try {
        const response = await fetcher.post<{
          data: { is_in_wishlist: boolean; wishlist_id?: string | null };
        }>("/api/me/wishlists/check", {
          item_type: "provider",
          item_id: id,
        });

        const inList = response.data?.is_in_wishlist || false;
        setIsInWishlist(inList);
        if (typeof window !== "undefined") {
          localStorage.setItem(cacheKey, String(inList));
        }
      } catch {
        if (cached === null) {
          setIsInWishlist(false);
        }
      }
    };

    checkWishlist();
  }, [authLoading, session, user, id]);

  const handleMessageClick = async () => {
    if (authLoading) {
      toast.info(pp("pleaseWait"));
      return;
    }
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    if (!id || isMessageLoading) return;

    try {
      setIsMessageLoading(true);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), 5000),
      );
      const conversationsPromise = fetcher.get<{ data: { provider_id?: string; id: string }[] }>(
        "/api/me/conversations",
      );
      const conversationsResponse = await Promise.race([conversationsPromise, timeoutPromise]);
      const conversations = conversationsResponse.data || [];
      const existingConv = conversations.find((conv) => conv.provider_id === id);

      if (existingConv) {
        window.location.href = `/account-settings/messages?conversation=${existingConv.id}`;
      } else {
        const createPromise = fetcher.post<{ data: { id: string; created: boolean } }>(
          "/api/me/conversations/create",
          { provider_id: id, booking_id: null },
        );
        const createResponse = await Promise.race([createPromise, timeoutPromise]);
        window.location.href = `/account-settings/messages?conversation=${createResponse.data.id}`;
      }
    } catch (err) {
      console.error("Error handling message:", err);
      toast.error(pp("openingChat"));
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
        { item_type: "provider", item_id: id },
      );
      const action = res.data?.action;
      if (action === "added" || action === "removed") {
        const newState = action === "added";
        setIsInWishlist(newState);
        if (user && id && typeof window !== "undefined") {
          const cacheKey = `wishlist_${user.id}_${id}`;
          localStorage.setItem(cacheKey, String(newState));
        }
        toast.success(action === "added" ? pp("savedToWishlist") : pp("removedFromWishlist"));
      }
    } catch (err) {
      const msg = err instanceof FetchError ? err.message : pp("failedWishlistUpdate");
      toast.error(msg);
    } finally {
      setIsToggling(false);
    }
  };

  const shareHeroImage =
    mosaicImages[0]?.src ?? thumbnail_url ?? gallery?.[0] ?? "/images/logo-beatonomi.svg";

  const renderMosaicTile = (
    image: { src: string; alt: string },
    index: number,
    opts?: { rounded?: string; showAllOverlay?: boolean },
  ) => (
    <button
      key={`${image.src}-${index}`}
      type="button"
      className={`relative block w-full h-full overflow-hidden cursor-pointer hover:opacity-90 transition-opacity text-left ${opts?.rounded ?? ""}`}
      onClick={() => {
        if (opts?.showAllOverlay && onOpenAllPhotos) {
          onOpenAllPhotos();
        } else {
          onOpenPhoto?.(index);
        }
      }}
      aria-label={
        opts?.showAllOverlay
          ? pp("showAllPhotos", { count: mosaicImages.length })
          : pp("viewPhotoA11y", { index: index + 1, total: mosaicImages.length })
      }
    >
      <ProviderGalleryImage
        src={image.src}
        alt={image.alt}
        fillHeight
        priority={index === 0}
        loading={index === 0 ? "eager" : "lazy"}
        sizes="(min-width: 1280px) 50vw, 40vw"
      />
      {opts?.showAllOverlay ? (
        <div className="absolute inset-0 bg-black/40 flex items-end justify-center pb-4 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 shadow-lg">
            {pp("showAllPhotos", { count: mosaicImages.length })}
          </span>
        </div>
      ) : null}
    </button>
  );

  return (
    <div className="max-w-[2340px] mx-auto">
      {/* Identity — above mosaic */}
      <div className="px-4 md:px-10 pt-4 md:pt-6 pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-1 gap-3 min-w-0">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gray-200 ring-1 ring-gray-200">
              {faceUrl ? (
                <Image
                  src={faceUrl}
                  alt={businessName ? `${businessName} ${pp("profilePhoto")}` : pp("providerProfilePhoto")}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-300 to-gray-400 text-lg font-bold text-white">
                  {(businessName || "P").charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl md:text-3xl font-bold leading-tight text-gray-900">
                  {businessName || providerFallback}
                </h1>
                {current_badge ? (
                  <span
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-white shadow-sm"
                    style={{ backgroundColor: current_badge.color || "#6366f1" }}
                    title={current_badge.description || current_badge.name}
                  >
                    {current_badge.icon_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={current_badge.icon_url} alt="" className="w-3.5 h-3.5 object-contain" aria-hidden />
                    )}
                    {current_badge.name}
                  </span>
                ) : null}
              </div>
              {subtitleParts.length > 0 ? (
                <p className="text-sm text-gray-600 mb-2">{subtitleParts.join(" · ")}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700">
                {rating !== undefined && rating > 0 ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-gray-900">
                    <Star className="h-4 w-4 fill-gray-900 text-gray-900" />
                    {rating.toFixed(2)}
                  </span>
                ) : null}
                {displayVoteCount > 0 ? (
                  <span>
                    {displayVoteCount === 1
                      ? pp("reviewCountLabelOne", { count: displayVoteCount })
                      : pp("reviewCountLabelOther", { count: displayVoteCount.toLocaleString() })}
                  </span>
                ) : null}
                {(city || country) && (
                  <span className="text-gray-600">{[city, country].filter(Boolean).join(", ")}</span>
                )}
                {starting_price != null && starting_price > 0 && currency ? (
                  <span className="text-gray-900 font-medium">
                    {pp("fromPrefix")}
                    <ApproxMoneyLabel amount={starting_price} chargeCurrency={currency} showBoth={false} />
                  </span>
                ) : null}
                {distance_km != null && Number.isFinite(distance_km) ? (
                  <span className="text-gray-600">{pp("distanceKm", { km: distance_km.toFixed(1) })}</span>
                ) : null}
                {is_verified ? (
                  <span className="text-gray-800 font-medium">{pp("verifiedTag")}</span>
                ) : null}
                {is_featured ? <span className="text-[#FF0077] font-medium">{pp("tagFeatured")}</span> : null}
                {openStatusLabel ? (
                  <span className="text-gray-800 font-medium">{openStatusLabel}</span>
                ) : null}
              </div>
              {owner_name ? (
                <p className="text-sm text-gray-600 mt-1">{pp("workWith", { name: owner_name })}</p>
              ) : null}
              {profileDescription ? (
                <p className="text-sm text-gray-700 mt-2 line-clamp-2 leading-relaxed">{profileDescription}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onBook?.()}
              className="px-5 py-2.5 rounded-full bg-[#FF0077] text-white text-sm font-semibold hover:bg-[#e6006c] shadow-sm transition-colors min-h-[44px]"
            >
              {pp("bookNowCta")}
            </button>
            <button
              type="button"
              onClick={handleMessageClick}
              disabled={isMessageLoading}
              className="p-2.5 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-70 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={pp("messageProvider")}
            >
              {isMessageLoading ? (
                <div className="h-5 w-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <MessageSquare className="h-5 w-5 text-gray-700" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleWishlist}
              disabled={isToggling}
              className="p-2.5 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-70 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={isInWishlist ? pp("removeFromWishlistA11y") : pp("addToWishlistA11y")}
            >
              <Heart
                className={`h-5 w-5 ${isInWishlist ? "fill-[#FF0077] text-[#FF0077]" : "text-gray-700"}`}
              />
            </button>
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="p-2.5 rounded-full border border-gray-200 hover:bg-gray-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={pp("shareAction")}
            >
              <Share2 className="h-5 w-5 text-gray-700" />
            </button>
            <button
              type="button"
              onClick={() => (user ? setIsReportModalOpen(true) : setIsLoginModalOpen(true))}
              className="p-2.5 rounded-full border border-gray-200 hover:bg-amber-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={pp("reportThisProvider")}
            >
              <Flag className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Height-capped mosaic */}
      {mosaicImages.length > 0 ? (
        <div className="px-4 md:px-10 pb-4">
          <div className={MOSAIC_HEIGHT}>
          {mosaicImages.length === 1 ? (
            <div className="h-full overflow-hidden rounded-2xl">
              {renderMosaicTile(mosaicImages[0], 0, { rounded: "rounded-2xl" })}
            </div>
          ) : mosaicImages.length <= 4 ? (
            <div className="grid grid-cols-2 gap-2 h-full">
              <div className="h-full min-h-0 overflow-hidden rounded-l-2xl">
                {renderMosaicTile(mosaicImages[0], 0)}
              </div>
              <div
                className={`grid gap-2 h-full min-h-0 ${
                  mosaicImages.length === 2
                    ? "grid-rows-1"
                    : mosaicImages.length === 3
                      ? "grid-rows-2"
                      : "grid-rows-3"
                }`}
              >
                {mosaicImages.slice(1).map((img, i) => {
                  const idx = i + 1;
                  const last = i === mosaicImages.length - 2;
                  const round =
                    i === 0 && last
                      ? "rounded-r-2xl"
                      : i === 0
                        ? "rounded-tr-2xl"
                        : last
                          ? "rounded-br-2xl"
                          : "";
                  return renderMosaicTile(img, idx, { rounded: round });
                })}
              </div>
            </div>
          ) : (
            <div className={`grid grid-cols-2 gap-2 h-full`}>
              <div className="h-full min-h-0 overflow-hidden rounded-l-2xl">
                {renderMosaicTile(mosaicImages[0], 0)}
              </div>
              <div className="grid grid-cols-2 grid-rows-2 gap-2 h-full min-h-0">
                {mosaicImages.slice(1, 5).map((img, i) => {
                  const idx = i + 1;
                  const isLast = i === 3;
                  return renderMosaicTile(img, idx, {
                    rounded: i === 1 ? "rounded-tr-2xl" : isLast ? "rounded-br-2xl" : "",
                    showAllOverlay: isLast && mosaicImages.length > 5,
                  });
                })}
              </div>
            </div>
          )}
          </div>
        </div>
      ) : null}

      {id ? (
        <ReportProviderModal
          open={isReportModalOpen}
          onOpenChange={setIsReportModalOpen}
          providerId={id}
          providerName={businessName || providerFallback}
        />
      ) : null}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        experienceTitle={businessName || providerFallback}
        experienceImage={shareHeroImage}
        shareUrl={
          typeof window !== "undefined"
            ? slug
              ? `${window.location.origin}/partner-profile?slug=${encodeURIComponent(slug)}`
              : window.location.href
            : undefined
        }
      />
      <LoginModal open={isLoginModalOpen} setOpen={setIsLoginModalOpen} initialMode="login" />
    </div>
  );
};

export default PartnerHero;