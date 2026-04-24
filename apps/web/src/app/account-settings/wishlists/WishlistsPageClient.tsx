"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import Breadcrumb from "../components/breadcrumb";
import BackButton from "../components/back-button";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import LoginModal from "@/components/global/login-modal";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import EmptyState from "@/components/ui/empty-state";
import LoadingTimeout from "@/components/ui/loading-timeout";
import ProviderCard from "@/app/home/components/provider-card-dynamic";
import { ExplorePostCard } from "@/components/explore/ExplorePostCard";
import type { PublicProviderCard } from "@/types/beautonomi";
import type { ExplorePost } from "@/types/explore";
import { Plus, LayoutGrid, ChevronDown, Check } from "lucide-react";
import type {
  ExploreCollectionSummary,
  SavedProduct,
  WishlistSummary,
  WishlistsPageInitial,
} from "./wishlists-page-types";
import RecentlyAdd from "./components/recently-add";

function mapRecentlyViewedThumbnails(res: { data?: unknown }): string[] {
  const raw = res?.data;
  const rows = Array.isArray(raw) ? raw : [];
  return (rows as { thumbnail_url?: string | null; avatar_url?: string | null }[])
    .slice(0, 4)
    .map((p) => String(p.thumbnail_url || p.avatar_url || "").trim())
    .filter((u) => u.length > 0);
}

const WishlistsPageClient = ({ initial }: { initial: WishlistsPageInitial | null }) => {
  const { user, isLoading } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [wishlists, setWishlists] = useState<WishlistSummary[]>(() => initial?.wishlists ?? []);
  const [savedProviders, setSavedProviders] = useState<PublicProviderCard[]>(() => initial?.savedProviders ?? []);
  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>(() => initial?.savedProducts ?? []);
  const [savedPosts, setSavedPosts] = useState<ExplorePost[]>(() => initial?.savedPosts ?? []);
  const [savedPostsLoading, setSavedPostsLoading] = useState(() => initial === null);
  const [collections, setCollections] = useState<ExploreCollectionSummary[]>(() => initial?.collections ?? []);
  const [recentlyViewedThumbnails, setRecentlyViewedThumbnails] = useState<string[]>(
    () => initial?.recentlyViewedThumbnails ?? [],
  );
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [boardDropdownPostId, setBoardDropdownPostId] = useState<string | null>(null);
  const [boardActionLoading, setBoardActionLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(() => initial === null);
  const [dataError, setDataError] = useState<string | null>(() => initial?.wishlistError ?? null);
  const skipHydrateLoadOnce = useRef(initial !== null);

  const updatePostCollectionIds = useCallback((postId: string, collectionId: string, add: boolean) => {
    setSavedPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const ids = p.collection_ids ?? [];
        if (add) return { ...p, collection_ids: ids.includes(collectionId) ? ids : [...ids, collectionId] };
        return { ...p, collection_ids: ids.filter((id) => id !== collectionId) };
      })
    );
    setCollections((prev) =>
      prev.map((c) => {
        if (c.id !== collectionId) return c;
        return { ...c, post_count: c.post_count + (add ? 1 : -1) };
      })
    );
  }, []);

  const savedProviderIds = React.useMemo(
    () => new Set(savedProviders.map((p) => p.id)),
    [savedProviders]
  );
  const handleSaveProviderChange = useCallback(
    (providerId: string, inWishlist: boolean) => {
      if (inWishlist) {
        fetcher
          .get<{ data: PublicProviderCard[] }>("/api/me/wishlists/providers", { staleTimeMs: 30_000 })
          .then((res) => {
            const d = (res as any)?.data ?? res;
            setSavedProviders(Array.isArray(d) ? d : d?.data ?? []);
          })
          .catch(() => {});
      } else {
        setSavedProviders((prev) => prev.filter((p) => p.id !== providerId));
      }
    },
    []
  );

  useEffect(() => {
    if (!user) return;
    if (skipHydrateLoadOnce.current) {
      skipHydrateLoadOnce.current = false;
      setDataLoading(false);
      setSavedPostsLoading(false);
      return;
    }
    const load = async () => {
      const stale = { staleTimeMs: 30_000 };
      setDataLoading(true);
      setDataError(null);
      setSavedPostsLoading(true);

      try {
        const [
          wlRes,
          provRes,
          prodRes,
          savedRes,
          collRes,
          recentRes,
        ] = await Promise.allSettled([
          fetcher.get<{ data: WishlistSummary[] }>("/api/me/wishlists", stale),
          fetcher.get<{ data: PublicProviderCard[] }>("/api/me/wishlists/providers", stale),
          fetcher.get<{ data: SavedProduct[] }>("/api/me/wishlists/products", stale),
          fetcher.get<{ data: ExplorePost[]; next_cursor?: string; has_more?: boolean }>(
            "/api/explore/saved?limit=50",
            stale
          ),
          fetcher.get<{ data: ExploreCollectionSummary[] }>("/api/explore/collections", stale),
          fetcher.get<{ data: { thumbnail_url?: string | null; avatar_url?: string | null }[] }>(
            "/api/me/recently-viewed?limit=4",
            stale,
          ),
        ]);

        if (wlRes.status === "fulfilled") {
          setWishlists(wlRes.value.data || []);
        } else {
          const wlErr = wlRes.reason;
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

        if (provRes.status === "fulfilled") {
          setSavedProviders(provRes.value.data || []);
        } else {
          console.error("Error loading saved providers:", provRes.reason);
          setSavedProviders([]);
        }

        if (prodRes.status === "fulfilled") {
          setSavedProducts(prodRes.value.data || []);
        } else {
          console.error("Error loading saved products:", prodRes.reason);
          setSavedProducts([]);
        }

        if (savedRes.status === "fulfilled") {
          const savedResValue = savedRes.value as { data?: ExplorePost[] | { data?: ExplorePost[] } };
          const body = savedResValue?.data ?? savedResValue;
          const list = Array.isArray(body) ? body : (body as { data?: ExplorePost[] })?.data ?? [];
          setSavedPosts(list);
        } else {
          console.error("Error loading saved posts:", savedRes.reason);
          setSavedPosts([]);
        }

        if (collRes.status === "fulfilled") {
          const collRaw = collRes.value as {
            data?: ExploreCollectionSummary[] | { data?: ExploreCollectionSummary[] };
          };
          const collBody = collRaw?.data ?? collRaw;
          const collList = Array.isArray(collBody) ? collBody : (collBody as { data?: ExploreCollectionSummary[] })?.data ?? [];
          setCollections(collList);
        } else {
          console.error("Error loading boards:", collRes.reason);
          setCollections([]);
        }

        if (recentRes.status === "fulfilled") {
          setRecentlyViewedThumbnails(mapRecentlyViewedThumbnails(recentRes.value as { data?: unknown }));
        } else {
          console.error("Error loading recently viewed:", recentRes.reason);
          setRecentlyViewedThumbnails([]);
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
        setSavedPostsLoading(false);
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
        <LoginModal
          open={isLoginModalOpen}
          setOpen={setIsLoginModalOpen}
          initialMode="login"
        />
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
      <RecentlyAdd thumbnails={recentlyViewedThumbnails} />
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
          <LoadingTimeout loadingMessage="Loading your saved items…" />
        </div>
      ) : dataError ? (
        <EmptyState
          title="Unable to load wishlists"
          description={dataError}
          action={{ label: "Try Again", onClick: () => window.location.reload() }}
        />
      ) : savedProviders.length === 0 && savedProducts.length === 0 && savedPosts.length === 0 && !savedPostsLoading ? (
        <div className="py-12">
          <EmptyState
            title="No saved items yet"
            description="Save products, posts, and providers to see them here."
            action={{
              label: "Explore",
              onClick: () => window.location.href = "/explore"
            }}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Saved posts section */}
          {/* Boards (collections of saved posts) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Boards</h3>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => {
                  const name = window.prompt("Board name (e.g. Summer looks)");
                  if (!name?.trim()) return;
                  setIsCreatingBoard(true);
                  fetcher
                    .post("/api/explore/collections", { name: name.trim() })
                    .then((res: any) => {
                      const created = res?.data ?? res;
                      setCollections((prev) => [...prev, { id: created.id, name: created.name, slug: created.slug, post_count: 0 }]);
                    })
                    .catch(() => { toast.error("Failed to create board. Please try again."); })
                    .finally(() => setIsCreatingBoard(false));
                }}
                disabled={isCreatingBoard}
              >
                <Plus className="h-4 w-4" />
                {isCreatingBoard ? "Creating…" : "New board"}
              </Button>
            </div>
            {collections.length === 0 ? (
              <p className="text-sm text-gray-600">Create boards to organize saved posts (e.g. Summer looks).</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {collections.map((c) => (
                  <Link
                    key={c.id}
                    href={`/explore/collections/${c.id}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 hover:border-[#FF0077] hover:bg-pink-50/50 transition-colors"
                  >
                    <LayoutGrid className="h-4 w-4 text-gray-500" />
                    <span className="font-medium text-gray-900">{c.name}</span>
                    <span className="text-sm text-gray-500">({c.post_count})</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {(savedPosts.length > 0 || savedPostsLoading) && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Saved posts</h3>
              {savedPostsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="bg-gray-100 rounded-2xl aspect-[4/5]" />
                  ))}
                </div>
              ) : (
                <div className="columns-2 sm:columns-3 lg:columns-4 gap-4">
                  {savedPosts.map((post) => (
                    <div key={post.id} className="break-inside-avoid mb-4 relative group">
                      <ExplorePostCard
                        post={post}
                        isProviderInWishlist={savedProviderIds.has(post.provider_id)}
                        onSaveProviderChange={handleSaveProviderChange}
                      />
                      {collections.length > 0 && (
                        <div className="mt-2 relative">
                          <button
                            type="button"
                            onClick={() => setBoardDropdownPostId((id) => (id === post.id ? null : post.id))}
                            className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-[#FF0077]"
                          >
                            Add to board
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${boardDropdownPostId === post.id ? "rotate-180" : ""}`} />
                          </button>
                          {boardDropdownPostId === post.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                aria-hidden
                                onClick={() => setBoardDropdownPostId(null)}
                              />
                              <div className="absolute left-0 top-full mt-1 z-20 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                                {collections.map((c) => {
                                  const inBoard = (post.collection_ids ?? []).includes(c.id);
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
                                      disabled={boardActionLoading}
                                      onClick={async () => {
                                        setBoardActionLoading(true);
                                        try {
                                          if (inBoard) {
                                            await fetcher.delete(`/api/explore/collections/${c.id}/posts?post_id=${post.id}`);
                                            updatePostCollectionIds(post.id, c.id, false);
                                          } else {
                                            await fetcher.post(`/api/explore/collections/${c.id}/posts`, { post_id: post.id });
                                            updatePostCollectionIds(post.id, c.id, true);
                                          }
                                        } finally {
                                          setBoardActionLoading(false);
                                        }
                                      }}
                                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                    >
                                      <span className="truncate">{c.name}</span>
                                      {inBoard ? (
                                        <span className="flex items-center gap-1 text-[#FF0077] shrink-0">
                                          <Check className="h-4 w-4" /> In board
                                        </span>
                                      ) : (
                                        <span className="text-gray-500 shrink-0">Add</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Saved providers section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Saved providers</h3>
            {savedProviders.length === 0 ? (
              <p className="text-sm text-gray-600">No saved providers yet. Save providers from posts or search.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {savedProviders.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    isInWishlistProp={true}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Saved products section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Saved products</h3>
            {savedProducts.length === 0 ? (
              <p className="text-sm text-gray-600">No saved products yet. Tap “Save to wishlist” on product pages.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {savedProducts.map((product) => (
                  <Link
                    key={product.id}
                    href={`/shop/${product.id}${product.provider?.slug ? `?provider=${encodeURIComponent(product.provider.slug)}` : ""}`}
                    className="group block overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:border-[#FF0077]/30 hover:shadow-md"
                  >
                    <div className="relative aspect-square bg-gray-50">
                      {product.image_urls?.[0] ? (
                        <Image
                          src={product.image_urls[0]}
                          alt={product.name}
                          fill
                          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                          className="object-contain p-3"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-gray-300">
                          <span className="text-xs">No image</span>
                        </div>
                      )}
                      {!product.in_stock && (
                        <span className="absolute left-2 top-2 rounded-full bg-red-100 px-2 py-1 text-[11px] font-medium text-red-700">
                          Out of stock
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-1 text-xs text-gray-500">{product.provider?.business_name}</p>
                      <p className="line-clamp-2 text-sm font-semibold text-gray-900 mt-1">{product.name}</p>
                      {product.brand ? (
                        <p className="line-clamp-1 text-xs text-gray-500 mt-1">{product.brand}</p>
                      ) : null}
                      <p className="mt-2 font-bold text-[#FF0077]">
                        {product.currency} {Number(product.retail_price || 0).toFixed(2)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
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

export default WishlistsPageClient;
