"use client";

import dynamic from "next/dynamic";
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from "react";
import ProviderPhotoDialog, {
  type ProviderPhotoDialogMode,
} from "./components/provider-photo-dialog";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Link from "next/link";

const heroFallback = (
  <div className="w-full aspect-[4/5] bg-gray-100 animate-pulse" aria-hidden />
);
const PartnerHeroMobile = dynamic(() => import("./components/partner-hero-mobile"), {
  loading: () => heroFallback,
});
const PartnerHero = dynamic(() => import("./components/partner-hero"), {
  loading: () => <div className="h-40 bg-gray-100 animate-pulse" aria-hidden />,
});
const PartnerServices = dynamic(() => import("./components/partner-services"), {
  loading: () => tabChunkFallback,
});
import { useAuth } from "@/providers/AuthProvider";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_PROVIDER_PROFILE_VIEW } from "@/lib/analytics/amplitude/types";
import { fetcher } from "@/lib/http/fetcher";
import type { PublicProviderDetail } from "@/types/beautonomi";
import type { PartnerProfileServiceCategoryInitial } from "@/types/partner-profile-services";
import { fetchProviderContactDisclosure } from "@/lib/providers/fetch-provider-contact";
import { usePartnerProfileT } from "@/lib/i18n/use-partner-profile-t";

const tabChunkFallback = (
  <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-10" aria-hidden>
    <div className="h-40 rounded-xl bg-gray-100 animate-pulse" />
  </div>
);

// Service packages live on the booking checkout/payment step (canonical pattern).
// We intentionally do not show a separate "Packages" tab on the profile so the
// package only ever attaches at the confirmation step, matching the customer
// app's `book-checkout.tsx` flow. See: apps/web/src/app/booking/components/steps/step-payment.tsx.
const PartnerProducts = dynamic(() => import("./components/partner-products").then((m) => m.default), {
  loading: () => tabChunkFallback,
});
const PartnerPhotos = dynamic(() => import("./components/partner-photos").then((m) => m.default), {
  loading: () => tabChunkFallback,
});
const PartnerTeam = dynamic(() => import("./components/partner-team").then((m) => m.default), {
  loading: () => tabChunkFallback,
});
const PartnerReviews = dynamic(() => import("./components/partner-reviews").then((m) => m.default), {
  loading: () => tabChunkFallback,
});
const PartnerBuy = dynamic(() => import("./components/partner-buy").then((m) => m.default), {
  loading: () => tabChunkFallback,
});
const PartnerMemberships = dynamic(() => import("./components/partner-memberships").then((m) => m.default), {
  loading: () => tabChunkFallback,
});
const PartnerAbout = dynamic(() => import("./components/partner-about").then((m) => m.default), {
  loading: () => tabChunkFallback,
});
const RequestCustomServicePage = dynamic(
  () => import("./components/request-custom-service-page").then((m) => m.default),
  { loading: () => tabChunkFallback },
);

interface PartnerProfileClientProps {
  provider: PublicProviderDetail & {
    owner_name?: string;
    operating_hours?: any;
    accepts_custom_requests?: boolean;
    distance_km?: number;
  };
  initialServiceCategories?: PartnerProfileServiceCategoryInitial[] | null;
}

export default function PartnerProfileClient({
  provider: initialProvider,
  initialServiceCategories,
}: PartnerProfileClientProps) {
  const [activeTab, setActiveTab] = useState("services");
  const [provider, setProvider] = useState(initialProvider);
  const [disclosureTier, setDisclosureTier] = useState<"anon" | "authed" | "booked">(
    initialProvider.disclosure_tier ?? "anon",
  );
  const { user, isLoading: authLoading } = useAuth();
  const { pp } = usePartnerProfileT();
  const { track, isReady } = useAmplitude();
  const profileViewTrackedRef = useRef(false);
  const distanceEnrichedRef = useRef(false);
  const pendingServicesScrollRef = useRef(false);
  const router = useRouter();

  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [photoDialogMode, setPhotoDialogMode] = useState<ProviderPhotoDialogMode>("viewer");
  const [photoDialogIndex, setPhotoDialogIndex] = useState(0);

  const profileImageUrls = useMemo(() => {
    const fromGallery = (provider.gallery ?? [])
      .map((url) => (typeof url === "string" ? url.trim() : ""))
      .filter((url) => url.length > 0);
    if (fromGallery.length > 0) return fromGallery;
    const thumb = provider.thumbnail_url?.trim();
    return thumb ? [thumb] : [];
  }, [provider.gallery, provider.thumbnail_url]);

  const dialogImages = useMemo(
    () =>
      profileImageUrls.map((url, idx) => ({
        src: url,
        alt: `${provider.business_name || "Provider"} image ${idx + 1}`,
      })),
    [profileImageUrls, provider.business_name],
  );

  const resolvedOperatingHours =
    provider.operating_hours ??
    (provider.locations?.find((l: { is_primary?: boolean }) => l.is_primary) ??
      provider.locations?.[0])?.working_hours;

  const scrollToServicesSection = useCallback(() => {
    const started = performance.now();
    const run = () => {
      const header = document.querySelector("header");
      const sentinel = document.getElementById("partner-profile-services");
      if (!sentinel) {
        if (performance.now() - started < 2000) requestAnimationFrame(run);
        return;
      }
      const headerH = header?.getBoundingClientRect().height ?? 0;
      const top = sentinel.getBoundingClientRect().top + window.scrollY - headerH;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, []);

  const handleBookFromHero = useCallback(() => {
    if (activeTab === "services") {
      scrollToServicesSection();
      return;
    }
    pendingServicesScrollRef.current = true;
    setActiveTab("services");
  }, [activeTab, scrollToServicesSection]);

  useLayoutEffect(() => {
    if (!pendingServicesScrollRef.current || activeTab !== "services") return;
    pendingServicesScrollRef.current = false;
    scrollToServicesSection();
  }, [activeTab, scrollToServicesSection]);

  const openPhotoAt = useCallback((index: number) => {
    if (dialogImages.length === 0) return;
    setPhotoDialogMode("viewer");
    setPhotoDialogIndex(index);
    setPhotoDialogOpen(true);
  }, [dialogImages.length]);

  const openAllPhotos = useCallback(() => {
    if (dialogImages.length === 0) return;
    setPhotoDialogMode("grid");
    setPhotoDialogIndex(0);
    setPhotoDialogOpen(true);
  }, [dialogImages.length]);

  useEffect(() => {
    setProvider(initialProvider);
    setDisclosureTier(initialProvider.disclosure_tier ?? "anon");
  }, [initialProvider]);

  useEffect(() => {
    if (!user?.id || !provider.slug) return;
    let cancelled = false;
    fetchProviderContactDisclosure(provider.slug)
      .then((contact) => {
        if (cancelled || !contact) return;
        setDisclosureTier(contact.disclosure_tier);
        setProvider((prev) => ({
          ...prev,
          description: contact.description ?? prev.description,
          website: contact.website ?? prev.website,
          social_media_links: contact.social_media_links ?? prev.social_media_links,
          locations: contact.locations ?? prev.locations,
          operating_hours: contact.operating_hours ?? prev.operating_hours,
          disclosure_tier: contact.disclosure_tier,
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id, provider.slug]);

  /** Match list cards: add lat/lng from saved marketplace location so server can return distance_km. */
  useEffect(() => {
    if (distanceEnrichedRef.current || typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("lat") && url.searchParams.get("lng")) {
        distanceEnrichedRef.current = true;
        return;
      }
      if (!url.searchParams.get("slug")) return;
      const raw = localStorage.getItem("userLocation");
      if (!raw) {
        distanceEnrichedRef.current = true;
        return;
      }
      const loc = JSON.parse(raw) as { latitude?: number; longitude?: number };
      const lat = Number(loc?.latitude);
      const lng = Number(loc?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        distanceEnrichedRef.current = true;
        return;
      }
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lng", String(lng));
      distanceEnrichedRef.current = true;
      router.replace(`${url.pathname}?${url.searchParams.toString()}`);
    } catch {
      distanceEnrichedRef.current = true;
    }
  }, [router]);

  useEffect(() => {
    if (provider && isReady && !profileViewTrackedRef.current) {
      profileViewTrackedRef.current = true;
      track(EVENT_PROVIDER_PROFILE_VIEW, {
        provider_id: provider.id,
        provider_name: provider.business_name,
      });
    }
  }, [provider, isReady, track]);

  useEffect(() => {
    if (user && provider?.id) {
      fetcher.post("/api/me/recently-viewed", { provider_id: provider.id }).catch(() => {});
    }
  }, [user, provider?.id]);

  const tabTriggerClass =
    "data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary rounded-none px-3 md:px-4 py-4 text-xs md:text-sm font-medium whitespace-nowrap text-gray-500 transition-colors";

  return (
    <>
      {/* Mobile Hero */}
      <PartnerHeroMobile
        id={provider.id}
        slug={provider.slug}
        businessName={provider.business_name}
        rating={provider.rating}
        review_count={provider.review_count}
        city={provider.city}
        country={provider.country}
        is_featured={provider.is_featured}
        is_verified={provider.is_verified}
        gallery={provider.gallery}
        description={provider.description}
        distance_km={provider.distance_km}
        thumbnail_url={provider.thumbnail_url}
        owner_name={provider.owner_name}
        business_type={provider.business_type}
        supports_house_calls={provider.supports_house_calls}
        supports_salon={provider.supports_salon}
        current_badge={provider.current_badge}
      />

      {/* Desktop Hero */}
      <div className="hidden md:block">
        <PartnerHero
          id={provider.id}
          slug={provider.slug}
          businessName={provider.business_name}
          rating={provider.rating}
          review_count={provider.review_count}
          city={provider.city}
          country={provider.country}
          is_featured={provider.is_featured}
          is_verified={provider.is_verified}
          gallery={profileImageUrls}
          description={provider.description}
          distance_km={provider.distance_km}
          thumbnail_url={provider.thumbnail_url}
          avatar_url={provider.avatar_url}
          owner_name={provider.owner_name}
          business_type={provider.business_type}
          supports_house_calls={provider.supports_house_calls}
          supports_salon={provider.supports_salon}
          current_badge={provider.current_badge}
          categories={provider.categories}
          starting_price={provider.starting_price}
          currency={provider.currency}
          operating_hours={resolvedOperatingHours}
          timezone={provider.timezone}
          disclosureTier={disclosureTier}
          onBook={handleBookFromHero}
          onOpenPhoto={openPhotoAt}
          onOpenAllPhotos={openAllPhotos}
        />
      </div>

      <ProviderPhotoDialog
        open={photoDialogOpen}
        onOpenChange={setPhotoDialogOpen}
        images={dialogImages}
        mode={photoDialogMode}
        initialIndex={photoDialogIndex}
        businessName={provider.business_name}
      />

      {/* Tab Navigation */}
      <div className="max-w-[2340px] mx-auto border-b border-gray-200 sticky top-0 bg-white/95 backdrop-blur-md z-40 md:bg-white md:backdrop-blur-none">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start h-auto bg-transparent p-0 border-0 rounded-none">
            <div
              className="flex overflow-x-auto scrollbar-hide px-4 md:px-10 w-full"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <TabsTrigger value="services" className={tabTriggerClass}>{pp("tabServices")}</TabsTrigger>
              <TabsTrigger value="shop" className={tabTriggerClass}>{pp("tabShop")}</TabsTrigger>
              <TabsTrigger value="photos" className={tabTriggerClass}>{pp("tabPhotos")}</TabsTrigger>
              {provider.business_type === "salon" && provider.staff_count && provider.staff_count > 0 && (
                <TabsTrigger value="team" className={tabTriggerClass}>{pp("tabTeam")}</TabsTrigger>
              )}
              <TabsTrigger value="reviews" className={tabTriggerClass}>{pp("tabReviews")}</TabsTrigger>
              <TabsTrigger value="memberships" className={tabTriggerClass}>{pp("tabMemberships")}</TabsTrigger>
              <TabsTrigger value="giftcard" className={tabTriggerClass}>{pp("tabGiftcard")}</TabsTrigger>
              {provider.accepts_custom_requests !== false && (
                <TabsTrigger value="custom-service" className={tabTriggerClass}>{pp("tabCustomService")}</TabsTrigger>
              )}
              <TabsTrigger value="about" className={tabTriggerClass}>{pp("tabAbout")}</TabsTrigger>
            </div>
          </TabsList>

          <TabsContent value="services" className="mt-0" id="partner-profile-services">
            <PartnerServices
              slug={provider.slug}
              id={provider.id}
              initialServiceCategories={initialServiceCategories}
            />
          </TabsContent>
          <TabsContent value="shop" className="mt-0">
            <PartnerProducts slug={provider.slug} />
          </TabsContent>
          <TabsContent value="photos" className="mt-0">
            <PartnerPhotos
              gallery={profileImageUrls}
              businessName={provider.business_name}
              slug={provider.slug}
              onOpenPhoto={openPhotoAt}
              onOpenAllPhotos={openAllPhotos}
            />
          </TabsContent>
          {provider.business_type === "salon" && provider.staff_count && provider.staff_count > 0 && (
            <TabsContent value="team" className="mt-0">
              <PartnerTeam slug={provider.slug} id={provider.id} />
            </TabsContent>
          )}
          <TabsContent value="reviews" className="mt-0">
            <PartnerReviews slug={provider.slug} rating={provider.rating} review_count={provider.review_count} />
          </TabsContent>
          <TabsContent value="memberships" className="mt-0">
            <PartnerMemberships providerSlug={provider.slug} providerId={provider.id} />
          </TabsContent>
          <TabsContent value="giftcard" className="mt-0">
            <PartnerBuy id={provider.id} slug={provider.slug} />
          </TabsContent>
          {provider.accepts_custom_requests !== false && (
            <TabsContent value="custom-service" className="mt-0">
              <RequestCustomServicePage
                providerId={provider.id}
                acceptsCustomRequests={provider.accepts_custom_requests ?? true}
                businessName={provider.business_name}
              />
            </TabsContent>
          )}
          <TabsContent value="about" className="mt-0">
            <PartnerAbout
              description={provider.description}
              locations={provider.locations}
              operating_hours={
                provider.operating_hours ??
                (provider.locations?.find((l: { is_primary?: boolean }) => l.is_primary) ??
                  provider.locations?.[0])?.working_hours
              }
              disclosureTier={disclosureTier}
              isAuthenticated={Boolean(user)}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky Conversion Footer for mobile */}
      {!authLoading && user && provider.id && (
        <div className="sticky bottom-0 w-full md:hidden bg-white border-t border-gray-200 shadow-lg z-50">
          <div className="px-4 py-3">
            <Link
              href={`/account-settings/messages?provider=${provider.id}`}
              className="flex items-center justify-center gap-2 w-full bg-gray-100 hover:bg-gray-200 transition-colors rounded-xl py-3 px-4"
              aria-label={pp("messageProvider")}
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <span className="text-sm font-medium text-gray-700">{pp("messageProvider")}</span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
