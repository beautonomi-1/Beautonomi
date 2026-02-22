"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PartnerHero from "./components/partner-hero";
import PartnerHeroMobile from "./components/partner-hero-mobile";
import PartnerPhotos from "./components/partner-photos";
import PartnerServices from "./components/partner-services";
import PartnerTeam from "./components/partner-team";
import PartnerReviews from "./components/partner-reviews";
import PartnerBuy from "./components/partner-buy";
import PartnerMemberships from "./components/partner-memberships";
import PartnerAbout from "./components/partner-about";
import RequestCustomServicePage from "./components/request-custom-service-page";
import Footer from "@/components/layout/footer";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import BottomNav from "@/components/layout/bottom-nav";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import type { PublicProviderDetail } from "@/types/beautonomi";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import ProviderMetadata from "./components/provider-metadata";

const PageContent = () => {
  const [activeTab, setActiveTab] = useState("services");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  
  // Get slug from URL params - decode if needed
  const slugParam = searchParams.get("slug") || searchParams.get("partnerId");
  const slug = slugParam ? decodeURIComponent(slugParam) : null;
  const [provider, setProvider] = useState<PublicProviderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProvider = async () => {
      if (!slug) {
        setError("Provider slug is required");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: PublicProviderDetail;
          error: null;
        }>(`/api/public/providers/${encodeURIComponent(slug)}`, {
          timeoutMs: 15000, // 15 seconds for provider detail page
        });
        setProvider(response.data);

        // Track view for authenticated users (silently ignore errors)
        fetcher.post("/api/me/recently-viewed", { provider_id: response.data.id }).catch(() => {});
      } catch (err) {
        let errorMessage = "Failed to load provider";
        
        if (err instanceof FetchTimeoutError) {
          errorMessage = "Request timed out. Please try again.";
        } else if (err instanceof FetchError) {
          errorMessage = err.message;
          // Add more context for debugging
          console.error("Error loading provider:", {
            message: err.message,
            status: err.status,
            code: err.code,
            slug: slug,
            details: err.details,
          });
        } else {
          console.error("Unexpected error loading provider:", err);
        }
        
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadProvider();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
        <BeautonomiHeader />
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading provider..." />
        </div>
        <Footer />
        <BottomNav />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="min-h-screen bg-white pb-20 md:pb-0">
        <BeautonomiHeader />
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Provider not found"
            description={error || "The provider you're looking for doesn't exist"}
            action={{
              label: "Go Home",
              onClick: () => router.push("/"),
            }}
          />
        </div>
        <Footer />
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <ProviderMetadata provider={provider} />
      <BeautonomiHeader />
      
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
        distance_km={(provider as any).distance_km}
        thumbnail_url={provider.thumbnail_url}
        owner_name={(provider as any).owner_name}
        business_type={provider.business_type}
        supports_house_calls={provider.supports_house_calls}
        supports_salon={provider.supports_salon}
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
          distance_km={(provider as any).distance_km}
          thumbnail_url={provider.thumbnail_url}
          owner_name={(provider as any).owner_name}
          business_type={provider.business_type}
          supports_house_calls={provider.supports_house_calls}
          supports_salon={provider.supports_salon}
        />
      </div>
      
      {/* Tab Navigation - Sticky with Backdrop Blur */}
      <div className="max-w-[2340px] mx-auto border-b border-gray-200 sticky top-0 bg-white/95 backdrop-blur-md z-40 md:bg-white md:backdrop-blur-none">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start h-auto bg-transparent p-0 border-0 rounded-none">
            <div className="flex overflow-x-auto scrollbar-hide px-4 md:px-10 w-full" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              <TabsTrigger
                value="services"
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent data-[state=active]:text-[#FF0077] rounded-none px-3 md:px-4 py-4 text-xs md:text-sm font-medium whitespace-nowrap text-gray-500 transition-colors"
              >
                Services
              </TabsTrigger>
              <TabsTrigger
                value="photos"
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent data-[state=active]:text-[#FF0077] rounded-none px-3 md:px-4 py-4 text-xs md:text-sm font-medium whitespace-nowrap text-gray-500 transition-colors"
              >
                Photos
              </TabsTrigger>
              {provider.business_type === "salon" && provider.staff_count && provider.staff_count > 0 && (
                <TabsTrigger
                  value="team"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent data-[state=active]:text-[#FF0077] rounded-none px-3 md:px-4 py-4 text-xs md:text-sm font-medium whitespace-nowrap text-gray-500 transition-colors"
                >
                  Team
                </TabsTrigger>
              )}
              <TabsTrigger
                value="reviews"
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent data-[state=active]:text-[#FF0077] rounded-none px-3 md:px-4 py-4 text-xs md:text-sm font-medium whitespace-nowrap text-gray-500 transition-colors"
              >
                Reviews
              </TabsTrigger>
              <TabsTrigger
                value="memberships"
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent data-[state=active]:text-[#FF0077] rounded-none px-3 md:px-4 py-4 text-xs md:text-sm font-medium whitespace-nowrap text-gray-500 transition-colors"
              >
                Memberships
              </TabsTrigger>
              <TabsTrigger
                value="giftcard"
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent data-[state=active]:text-[#FF0077] rounded-none px-3 md:px-4 py-4 text-xs md:text-sm font-medium whitespace-nowrap text-gray-500 transition-colors"
              >
                Giftcard
              </TabsTrigger>
              <TabsTrigger
                value="custom-service"
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent data-[state=active]:text-[#FF0077] rounded-none px-3 md:px-4 py-4 text-xs md:text-sm font-medium whitespace-nowrap text-gray-500 transition-colors"
              >
                Request Custom Service
              </TabsTrigger>
              <TabsTrigger
                value="about"
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#FF0077] data-[state=active]:bg-transparent data-[state=active]:text-[#FF0077] rounded-none px-3 md:px-4 py-4 text-xs md:text-sm font-medium whitespace-nowrap text-gray-500 transition-colors"
              >
                About
              </TabsTrigger>
            </div>
          </TabsList>

          <TabsContent value="services" className="mt-0">
            <PartnerServices slug={provider.slug} id={provider.id} />
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
            <PartnerMemberships providerSlug={provider.slug} />
          </TabsContent>

          <TabsContent value="giftcard" className="mt-0">
            <PartnerBuy id={provider.id} slug={provider.slug} />
          </TabsContent>

          <TabsContent value="custom-service" className="mt-0">
            <RequestCustomServicePage 
              providerId={provider.id} 
              acceptsCustomRequests={(provider as any).accepts_custom_requests !== false}
              businessName={provider.business_name}
            />
          </TabsContent>

          <TabsContent value="about" className="mt-0">
            <PartnerAbout 
              description={provider.description}
              locations={provider.locations}
              operating_hours={(provider as any).operating_hours || (provider.locations?.[0]?.working_hours ? (typeof provider.locations[0].working_hours === 'string' ? JSON.parse(provider.locations[0].working_hours) : provider.locations[0].working_hours) : undefined)}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky Conversion Footer for mobile - Message Only */}
      {!authLoading && user && provider.id && (
        <div className="sticky bottom-0 w-full md:hidden bg-white border-t border-gray-200 shadow-lg z-50">
          <div className="px-4 py-3">
            <Link
              href={`/account-settings/messages?provider=${provider.id}`}
              className="flex items-center justify-center gap-2 w-full bg-gray-100 hover:bg-gray-200 transition-colors rounded-xl py-3 px-4"
              aria-label="Message provider"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">Message Provider</span>
            </Link>
          </div>
        </div>
      )}

      <Footer />
      <BottomNav />
    </div>
  );
};

// Note: Metadata generation is handled via middleware/headers since this is a client component
// The X-Robots-Tag header is set in the API response

const Page = () => {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white pb-20 md:pb-0">
        <BeautonomiHeader />
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading provider..." />
        </div>
        <Footer />
        <BottomNav />
      </div>
    }>
      <PageContent />
    </Suspense>
  );
};

export default Page;
