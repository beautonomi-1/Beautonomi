"use client";

import dynamic from "next/dynamic";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Link from "next/link";

const heroFallback = (
  <div className="w-full h-[300px] md:h-[400px] bg-gray-100 animate-pulse" aria-hidden />
);
const PartnerHeroMobile = dynamic(() => import("./components/partner-hero-mobile"), {
  loading: () => heroFallback,
});
const PartnerHero = dynamic(() => import("./components/partner-hero"), {
  loading: () => heroFallback,
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
  provider,
  initialServiceCategories,
}: PartnerProfileClientProps) {
  const [activeTab, setActiveTab] = useState("services");
  const { user, isLoading: authLoading } = useAuth();
  const { track, isReady } = useAmplitude();
  const profileViewTrackedRef = useRef(false);
  const distanceEnrichedRef = useRef(false);
  const router = useRouter();

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
      </div>

      {/* Tab Navigation */}
      <div className="max-w-[2340px] mx-auto border-b border-gray-200 sticky top-0 bg-white/95 backdrop-blur-md z-40 md:bg-white md:backdrop-blur-none">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start h-auto bg-transparent p-0 border-0 rounded-none">
            <div
              className="flex overflow-x-auto scrollbar-hide px-4 md:px-10 w-full"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <TabsTrigger value="services" className={tabTriggerClass}>Services</TabsTrigger>
              <TabsTrigger value="shop" className={tabTriggerClass}>Shop</TabsTrigger>
              <TabsTrigger value="photos" className={tabTriggerClass}>Photos</TabsTrigger>
              {provider.business_type === "salon" && provider.staff_count && provider.staff_count > 0 && (
                <TabsTrigger value="team" className={tabTriggerClass}>Team</TabsTrigger>
              )}
              <TabsTrigger value="reviews" className={tabTriggerClass}>Reviews</TabsTrigger>
              <TabsTrigger value="memberships" className={tabTriggerClass}>Memberships</TabsTrigger>
              <TabsTrigger value="giftcard" className={tabTriggerClass}>Giftcard</TabsTrigger>
              {provider.accepts_custom_requests !== false && (
                <TabsTrigger value="custom-service" className={tabTriggerClass}>Request Custom Service</TabsTrigger>
              )}
              <TabsTrigger value="about" className={tabTriggerClass}>About</TabsTrigger>
            </div>
          </TabsList>

          <TabsContent value="services" className="mt-0">
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
            <PartnerPhotos gallery={provider.gallery} businessName={provider.business_name} slug={provider.slug} />
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
              operating_hours={provider.operating_hours ?? (provider.locations?.find((l: any) => l.is_primary) ?? provider.locations?.[0])?.working_hours}
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
              aria-label="Message provider"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <span className="text-sm font-medium text-gray-700">Message Provider</span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
