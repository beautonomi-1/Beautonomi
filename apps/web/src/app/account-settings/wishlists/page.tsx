"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Breadcrumb from "../components/breadcrumb";
import BackButton from "../components/back-button";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import LoginModal from "@/components/global/login-modal";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import EmptyState from "@/components/ui/empty-state";
import LoadingTimeout from "@/components/ui/loading-timeout";
import ProviderCard from "@/app/home/components/provider-card";
import type { PublicProviderCard } from "@/types/beautonomi";
import { Plus } from "lucide-react";

type WishlistSummary = {
  id: string;
  name: string;
  is_default: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  item_count: number;
  cover_images: string[];
};

const Page = () => {
  const { user, isLoading } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [wishlists, setWishlists] = useState<WishlistSummary[]>([]);
  const [savedProviders, setSavedProviders] = useState<PublicProviderCard[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        setDataLoading(true);
        setDataError(null);
        
        // Load wishlists
        try {
          const wl = await fetcher.get<{ data: WishlistSummary[] }>("/api/me/wishlists", { cache: "no-store" });
          setWishlists(wl.data || []);
        } catch (wlErr) {
          console.error("Error loading wishlists:", wlErr);
          const wlErrorMessage =
            wlErr instanceof FetchTimeoutError
              ? "Request timed out. Please try again."
              : wlErr instanceof FetchError
              ? wlErr.message
              : "Failed to load wishlists";
          setDataError(wlErrorMessage);
          setWishlists([]);
        }

        // Load saved providers from all wishlists
        try {
          const providers = await fetcher.get<{ data: PublicProviderCard[] }>("/api/me/wishlists/providers", { cache: "no-store" });
          console.log("Wishlist page - Received providers:", {
            count: providers.data?.length || 0,
            sample: providers.data?.slice(0, 1),
          });
          setSavedProviders(providers.data || []);
        } catch (providersErr) {
          console.error("Error loading saved providers:", providersErr);
          // Don't set error state - just show empty list
          // The page will show "No saved providers yet" message
          setSavedProviders([]);
        }
      } catch (err) {
        console.error("Unexpected error:", err);
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load data";
        setDataError(errorMessage);
      } finally {
        setDataLoading(false);
      }
    };
    load();
  }, [user]);

  // Show login prompt when not authenticated
  if (!isLoading && !user) {
    return (
      <div className='w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12 lg:py-16'>
        <div className="flex flex-col min-h-[60vh]">
          <h2 className='text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-6 md:mb-8'>Wishlists</h2>
          <div className="flex flex-col flex-1 justify-center">
            <p className="text-base md:text-lg font-bold text-gray-900 mb-3 md:mb-4">
              Log in to view your wishlists
            </p>
            <p className="text-sm md:text-base text-gray-600 mb-8 md:mb-10 max-w-lg">
              You can create, view, or edit wishlists once you&apos;ve logged in.
            </p>
            <div className="flex justify-start">
              <Button
                onClick={() => setIsLoginModalOpen(true)}
                className="bg-[#FF0077] hover:bg-[#D60565] text-white px-6 md:px-8 py-3 md:py-4 text-base md:text-lg font-medium rounded-lg"
              >
                Log in
              </Button>
            </div>
          </div>
        </div>
        <LoginModal open={isLoginModalOpen} setOpen={setIsLoginModalOpen} />
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className='w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8'>
        <BackButton href="/account-settings" />
        <Breadcrumb 
          items={[
            { label: "Account", href: "/account-settings" },
            { label: "Wishlists" }
          ]} 
        />
        <h2 className='text-2xl md:text-3xl font-medium text-secondary mb-4 md:mb-6'>Wishlists</h2>
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show wishlists when authenticated
  return (
    <div className='w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8'>
      <BackButton href="/account-settings" />
      <Breadcrumb 
        items={[
          { label: "Account", href: "/account-settings" },
          { label: "Wishlists" }
        ]} 
      />
      <div className="flex items-center justify-between mb-6">
        <h2 className='text-2xl md:text-3xl font-medium text-secondary'>Saved</h2>
        {wishlists.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              {wishlists.length} {wishlists.length === 1 ? "wishlist" : "wishlists"}
            </span>
          </div>
        )}
      </div>

      {dataLoading ? (
        <div className="py-12">
          <LoadingTimeout loadingMessage="Loading your saved providers..." />
        </div>
      ) : dataError ? (
        <EmptyState
          title="Unable to load wishlists"
          description={dataError}
          action={{ label: "Try Again", onClick: () => window.location.reload() }}
        />
      ) : savedProviders.length === 0 ? (
        <div className="py-12">
          <EmptyState
            title="No saved providers yet"
            description="Start exploring and save your favorite providers by clicking the heart icon."
            action={{
              label: "Explore Providers",
              onClick: () => window.location.href = "/"
            }}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Saved Providers Grid - Airbnb Style */}
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {savedProviders.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  isInWishlistProp={true} // All providers on wishlist page are saved
                />
              ))}
            </div>
          </div>

          {/* Wishlist Collections (Optional - shown if user has multiple wishlists) */}
          {wishlists.length > 1 && (
            <div className="border-t pt-8 mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Your wishlists</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  New wishlist
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {wishlists.map((w) => (
                  <Link 
                    key={w.id} 
                    href={`/account-settings/wishlists/${w.id}`}
                    className="block border rounded-xl p-4 hover:border-[#FF0077] hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-900">{w.name}</h4>
                      {w.is_default && (
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600">
                        {w.item_count} {w.item_count === 1 ? "item" : "items"}
                      </p>
                      {w.cover_images && w.cover_images.length > 0 && (
                        <div className="flex -space-x-2">
                          {w.cover_images.slice(0, 3).map((img, idx) => (
                            <div
                              key={idx}
                              className="relative w-8 h-8 rounded-full border-2 border-white overflow-hidden"
                            >
                              <Image
                                src={img}
                                alt=""
                                fill
                                sizes="32px"
                                className="object-cover"
                              />
                            </div>
                          ))}
                          {w.cover_images.length > 3 && (
                            <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center">
                              <span className="text-xs text-gray-600 font-medium">
                                +{w.cover_images.length - 3}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Page
