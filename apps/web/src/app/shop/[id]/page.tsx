"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { getCsrfHeaders } from "@/lib/csrf";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";

interface ProductVariant {
  id: string;
  option_values: Record<string, string>;
  sort_order?: number;
  retail_price: number;
  quantity: number;
  sku?: string | null;
  image_url?: string | null;
}

interface ProductDetail {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  short_description: string | null;
  long_description: string | null;
  description: string | null;
  retail_price: number;
  currency?: string | null;
  image_urls: string[];
  quantity: number;
  tags: string[];
  has_variants?: boolean;
  variant_option_types?: Array<{ name: string; values: string[] }>;
  variants?: ProductVariant[];
  track_stock_quantity?: boolean | null;
  provider: { id: string; business_name: string; slug: string; logo_url: string | null };
}

interface CollectionLocation {
  id: string;
  name: string;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  working_hours?: unknown;
}

/** Format price with currency; `fallback` is used when `currency` is missing (e.g. tenant default). */
function formatPrice(price: number, currency: string | null | undefined, fallback: string): string {
  const code = (currency || fallback).toUpperCase();
  return `${code} ${price.toFixed(2)}`;
}

interface Review {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  is_verified_purchase: boolean;
  created_at: string;
  customer: { full_name: string; avatar_url: string | null };
  provider_response: string | null;
}

interface RelatedProduct {
  id: string;
  name: string;
  retail_price: number;
  image_urls: string[];
  brand: string | null;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${i <= Math.round(rating) ? "text-yellow-400" : "text-gray-200"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function ProductDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;

  const rawId = params?.id;
  const productId =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) && rawId[0] ? rawId[0] : undefined;
  const providerSlugParam = searchParams.get("provider");

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [reviews, setReviews] = useState<{ average_rating: number; total_count: number; recent: Review[] }>({
    average_rating: 0,
    total_count: 0,
    recent: [],
  });
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [shipping, setShipping] = useState<Record<string, unknown> | null>(null);
  const [collectionLocations, setCollectionLocations] = useState<CollectionLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartMessage, setCartMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [isWishlistLoading, setIsWishlistLoading] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [preferGalleryHero, setPreferGalleryHero] = useState(false);

  const hasVariants = Boolean(product?.has_variants && product?.variants?.length);
  const variants = [...(product?.variants ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const selectedVariant = hasVariants && selectedVariantId ? variants.find((v) => v.id === selectedVariantId) : null;
  const displayPrice = hasVariants && selectedVariant ? selectedVariant.retail_price : (product?.retail_price ?? 0);
  const displayQuantity = hasVariants && selectedVariant ? selectedVariant.quantity : (product?.quantity ?? 0);
  const trackStock = Boolean(product?.track_stock_quantity);

  const heroImageUrl =
    preferGalleryHero && product?.image_urls?.length
      ? product.image_urls[activeImage] ?? null
      : hasVariants && selectedVariant?.image_url
        ? selectedVariant.image_url
        : product?.image_urls?.[activeImage] ?? null;

  useEffect(() => {
    setPreferGalleryHero(false);
  }, [selectedVariantId]);

  useEffect(() => {
    if (!user || !productId) {
      setIsInWishlist(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/wishlists/check", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
          body: JSON.stringify({ item_type: "product", item_id: productId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled) {
          const inWishlist = Boolean((json?.data ?? json)?.is_in_wishlist);
          setIsInWishlist(inWishlist);
        }
      } catch {
        if (!cancelled) setIsInWishlist(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, productId]);

  const handleToggleWishlist = useCallback(async () => {
    if (!productId || isWishlistLoading) return;
    if (!user) {
      const q = providerSlugParam ? `?provider=${encodeURIComponent(providerSlugParam)}` : "";
      router.push(`/account-settings?redirect=${encodeURIComponent(`/shop/${productId}${q}`)}`);
      return;
    }
    setIsWishlistLoading(true);
    try {
      const res = await fetch("/api/me/wishlists/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_type: "product", item_id: productId }),
      });
      const json = await res.json().catch(() => ({}));
      const action = (json?.data ?? json)?.action;
      if (action === "added" || action === "removed") {
        const added = action === "added";
        setIsInWishlist(added);
        setCartMessage({
          text: added ? "Saved to wishlist" : "Removed from wishlist",
          type: "success",
        });
        setTimeout(() => setCartMessage(null), 2500);
      } else {
        setCartMessage({ text: "Could not update wishlist", type: "error" });
      }
    } catch {
      setCartMessage({ text: "Could not update wishlist", type: "error" });
    } finally {
      setIsWishlistLoading(false);
    }
  }, [productId, isWishlistLoading, user, providerSlugParam, router]);

  const handleAddToCart = useCallback(async () => {
    if (!product || addingToCart) return;
    if (hasVariants && !selectedVariantId) {
      setCartMessage({ text: "Please select a variant", type: "error" });
      return;
    }
    if (!user) {
      const q = providerSlugParam ? `?provider=${encodeURIComponent(providerSlugParam)}` : "";
      router.push(`/account-settings?redirect=${encodeURIComponent(`/shop/${product.id}${q}`)}`);
      return;
    }
    setAddingToCart(true);
    setCartMessage(null);
    try {
      const res = await fetch("/api/me/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          quantity,
          ...(hasVariants && selectedVariantId ? { product_variant_id: selectedVariantId } : {}),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setCartMessage({ text: "Added to cart!", type: "success" });
        setTimeout(() => setCartMessage(null), 3000);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("beautonomi:cart-updated"));
        }
      } else if (res.status === 401) {
        setCartMessage({
          text: "Please sign in to add to cart.",
          type: "error",
        });
        const q = providerSlugParam ? `?provider=${encodeURIComponent(providerSlugParam)}` : "";
        router.push(`/account-settings?redirect=${encodeURIComponent(`/shop/${product.id}${q}`)}`);
      } else {
        setCartMessage({ text: json.error?.message || json.error || "Failed to add to cart", type: "error" });
      }
    } catch {
      setCartMessage({ text: "Something went wrong", type: "error" });
    }
    setAddingToCart(false);
  }, [product, quantity, addingToCart, user, router, hasVariants, selectedVariantId, providerSlugParam]);

  useEffect(() => {
    if (!productId) {
      setLoading(false);
      setFetchError("Missing product link.");
      setProduct(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFetchError(null);
      setSelectedVariantId(null);
      try {
        const res = await fetch(`/api/public/products/${encodeURIComponent(productId)}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          const msg =
            typeof json?.error?.message === "string"
              ? json.error.message
              : typeof json?.error === "string"
                ? json.error
                : res.status === 404
                  ? "This product is unavailable or no longer listed."
                  : "We could not load this product. Please try again.";
          setFetchError(msg);
          setProduct(null);
          return;
        }
        const payload = json?.data;
        if (payload?.product) {
          const p = payload.product as ProductDetail;
          setProduct(p);
          setReviews(payload.reviews ?? { average_rating: 0, total_count: 0, recent: [] });
          setRelated(Array.isArray(payload.related_products) ? payload.related_products : []);
          setShipping(payload.shipping ?? null);
          setCollectionLocations(Array.isArray(payload.collection_locations) ? payload.collection_locations : []);
          if (p.has_variants && Array.isArray(p.variants) && p.variants.length > 0) {
            const sortedVariants = [...p.variants].sort((a: ProductVariant, b: ProductVariant) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            const firstInStock = sortedVariants.find((v: ProductVariant) => (v.quantity || 0) > 0);
            setSelectedVariantId(firstInStock ? firstInStock.id : sortedVariants[0].id);
            setPreferGalleryHero(false);
          }
        } else {
          setFetchError("This product could not be found.");
          setProduct(null);
        }
      } catch {
        if (!cancelled) {
          setFetchError("Something went wrong while loading this product.");
          setProduct(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const backHref =
    providerSlugParam != null && providerSlugParam.length > 0
      ? `/partner-profile?slug=${encodeURIComponent(providerSlugParam)}`
      : "/shop";

  const backLabel = providerSlugParam ? "Back to provider" : "Back to shop";

  if (loading) {
    return (
      <div className="min-h-screen bg-white pb-20 md:pb-0">
        <BeautonomiHeader />
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600" />
        </div>
        <Footer />
        <BottomNav />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-white pb-20 md:pb-0">
        <BeautonomiHeader />
        <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-12 flex flex-col items-center text-center text-gray-600">
          <p className="text-lg font-medium text-gray-900">Product not found</p>
          <p className="mt-2 max-w-md text-sm text-gray-500">{fetchError}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={backHref}
              className="rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pink-700"
            >
              {backLabel}
            </Link>
            <button type="button" onClick={() => router.back()} className="text-sm text-pink-600 hover:underline">
              Go back
            </button>
          </div>
        </div>
        <Footer />
        <BottomNav />
      </div>
    );
  }

  const desc = product.long_description || product.description || product.short_description;
  const inStock = hasVariants
    ? Boolean(selectedVariant && selectedVariant.quantity > 0)
    : !trackStock || (product.quantity || 0) > 0;
  const maxQty = hasVariants && selectedVariant
    ? Math.max(0, selectedVariant.quantity)
    : !trackStock
      ? 99
      : Math.max(0, product.quantity);

  const showFromPrice = hasVariants && variants.length > 1;
  const offersCollection = Boolean(shipping && (shipping as { offers_collection?: boolean }).offers_collection);
  const offersDelivery = Boolean(shipping && (shipping as { offers_delivery?: boolean }).offers_delivery);

  const partnerProfileHref = `/partner-profile?slug=${encodeURIComponent(product.provider.slug)}`;

  return (
    <div className="min-h-screen bg-gray-50/80 pb-20 md:pb-0">
      <BeautonomiHeader />
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-6 md:py-10">
        <nav className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500" aria-label="Breadcrumb">
          <Link href="/shop" className="hover:text-gray-800">
            Shop
          </Link>
          <span aria-hidden>/</span>
          <Link href={partnerProfileHref} className="hover:text-gray-800 line-clamp-1">
            {product.provider.business_name}
          </Link>
          <span aria-hidden>/</span>
          <span className="text-gray-900 font-medium line-clamp-1">{product.name}</span>
        </nav>

        <Link
          href={backHref}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {backLabel}
        </Link>

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12 lg:items-start">
          <div className="space-y-4">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm">
              {heroImageUrl ? (
                <Image
                  src={heroImageUrl}
                  alt={product.name}
                  fill
                  className="object-contain p-4 md:p-6"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-300">
                  <svg className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                </div>
              )}
            </div>
            {hasVariants && variants.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Options</p>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const label = Object.entries(v.option_values)
                      .map(([, val]) => val)
                      .join(" / ");
                    const isSelected = selectedVariantId === v.id;
                    const outOfStock = (v.quantity || 0) <= 0;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          if (outOfStock) return;
                          setSelectedVariantId(v.id);
                        }}
                        disabled={outOfStock}
                        className={`flex max-w-[120px] flex-col items-center gap-1 rounded-xl border-2 p-1.5 text-center transition ${
                          isSelected
                            ? "border-pink-600 bg-pink-50 ring-1 ring-pink-200"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        } ${outOfStock ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        <span className="relative block h-14 w-14 overflow-hidden rounded-xl bg-white ring-1 ring-gray-100">
                          {v.image_url ? (
                            <Image src={v.image_url} alt="" fill className="object-contain p-1" sizes="56px" />
                          ) : (
                            <span className="flex h-full items-center justify-center px-1 text-[10px] font-medium leading-tight text-gray-600">
                              {label}
                            </span>
                          )}
                        </span>
                        <span className="line-clamp-2 w-full px-0.5 text-[10px] font-medium leading-tight text-gray-800">
                          {label}
                        </span>
                        {outOfStock && <span className="text-[9px] text-red-600">Out</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {!hasVariants && product.image_urls.length > 1 && (
              <div className="flex flex-wrap gap-3">
                {product.image_urls.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => {
                      setActiveImage(i);
                      setPreferGalleryHero(true);
                    }}
                    className={`relative h-20 w-20 overflow-hidden rounded-xl border-2 bg-white transition ${
                      i === activeImage ? "border-pink-500 ring-1 ring-pink-200" : "border-gray-200"
                    }`}
                  >
                    <Image src={url} alt="" fill className="object-contain p-1" sizes="80px" />
                  </button>
                ))}
              </div>
            )}
            {hasVariants && product.image_urls.length > 1 && (
              <div>
                <p className="mb-2 text-xs text-gray-500">More product photos</p>
                <div className="flex flex-wrap gap-3">
                  {product.image_urls.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => {
                        setActiveImage(i);
                        setPreferGalleryHero(true);
                      }}
                      className={`relative h-16 w-16 overflow-hidden rounded-xl border-2 bg-white ${
                        preferGalleryHero && i === activeImage ? "border-pink-500" : "border-gray-200"
                      }`}
                    >
                      <Image src={url} alt="" fill className="object-contain p-1" sizes="64px" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-8 lg:sticky lg:top-28">
            {product.category ? (
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-pink-600">{product.category}</p>
            ) : null}
            {product.brand ? <p className="mb-1 text-sm font-medium text-gray-400">{product.brand}</p> : null}
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{product.name}</h1>

            {hasVariants && selectedVariant && (
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-gray-800">
                  {product.variant_option_types?.[0]?.name ?? "Option"}:{" "}
                </span>
                {Object.entries(selectedVariant.option_values)
                  .map(([, val]) => val)
                  .join(" / ")}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <span className="text-3xl font-extrabold text-pink-600">
                {showFromPrice
                  ? `From ${formatPrice(displayPrice, product.currency, tenantCurrency)}`
                  : formatPrice(displayPrice, product.currency, tenantCurrency)}
              </span>
              {reviews.total_count > 0 && (
                <div className="flex items-center gap-2">
                  <Stars rating={reviews.average_rating} />
                  <span className="text-sm text-gray-500">({reviews.total_count})</span>
                </div>
              )}
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={handleToggleWishlist}
                disabled={isWishlistLoading}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  isInWishlist
                    ? "border-pink-300 bg-pink-50 text-pink-700"
                    : "border-gray-200 bg-white text-gray-700 hover:border-pink-300 hover:text-pink-700"
                } disabled:opacity-60`}
              >
                {isWishlistLoading ? "Saving..." : isInWishlist ? "Saved to wishlist" : "Save to wishlist"}
              </button>
            </div>

            <div
              className={`mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                inStock ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
              }`}
            >
              {inStock
                ? trackStock || hasVariants
                  ? `In stock${displayQuantity > 0 ? ` (${displayQuantity})` : ""}`
                  : "In stock"
                : "Out of stock"}
            </div>

            {desc ? (
              <div className="mt-6 border-t border-gray-100 pt-6">
                <h2 className="text-sm font-semibold text-gray-900">About this product</h2>
                <p className="mt-2 whitespace-pre-line leading-relaxed text-gray-600">{desc}</p>
              </div>
            ) : null}

            {product.tags?.length ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {product.tags.map((t) => (
                  <span key={t} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}

            {inStock && (
              <>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center rounded-xl border border-gray-200 bg-white">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="px-4 py-3 text-gray-600 hover:text-gray-900"
                    >
                      −
                    </button>
                    <span className="min-w-[40px] text-center font-bold">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.min(maxQty, quantity + 1))}
                      disabled={maxQty <= 0}
                      className="px-4 py-3 text-gray-600 hover:text-gray-900 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  {user ? (
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      disabled={addingToCart || maxQty <= 0}
                      className="flex-1 rounded-xl bg-pink-600 px-6 py-4 text-center text-base font-bold text-white transition hover:bg-pink-700 disabled:opacity-50"
                    >
                      {addingToCart
                        ? "Adding…"
                        : `Add to cart — ${formatPrice(displayPrice * quantity, product.currency, tenantCurrency)}`}
                    </button>
                  ) : (
                    <Link
                      href={`/account-settings?redirect=${encodeURIComponent(`/shop/${product.id}${providerSlugParam ? `?provider=${encodeURIComponent(providerSlugParam)}` : ""}`)}`}
                      className="flex-1 rounded-xl bg-pink-600 px-6 py-4 text-center text-base font-bold text-white transition hover:bg-pink-700"
                    >
                      Sign in to add to cart
                    </Link>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Link
                    href="/cart"
                    className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black"
                  >
                    View cart
                  </Link>
                  <Link
                    href={`/shop/checkout?provider_id=${encodeURIComponent(product.provider.id)}`}
                    className="inline-flex items-center justify-center rounded-xl border-2 border-pink-600 bg-white px-4 py-3 text-sm font-semibold text-pink-700 transition hover:bg-pink-50"
                  >
                    Checkout now
                  </Link>
                </div>
                {cartMessage && (
                  <div
                    className={`mt-3 rounded-lg px-4 py-3 text-sm font-medium ${
                      cartMessage.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {cartMessage.text}
                    {cartMessage.type === "success" && (
                      <Link href="/cart" className="ml-2 underline">
                        View cart
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}

            {shipping && (
              <div className="mt-8 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-3 font-semibold text-gray-900">Delivery &amp; collection</h3>
                {offersCollection && (
                  <div className="mb-2 flex items-center gap-2 text-sm text-gray-600">
                    <svg className="h-4 w-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Pickup / collection available
                  </div>
                )}
                {offersDelivery && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                      <svg className="h-4 w-4 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>
                        Delivery fee:{" "}
                        {formatPrice(
                          Number((shipping as { delivery_fee?: number }).delivery_fee ?? 0),
                          product.currency,
                          tenantCurrency,
                        )}
                        {(shipping as { free_delivery_threshold?: number | null }).free_delivery_threshold != null && (
                          <>
                            {" "}
                            · Free over{" "}
                            {formatPrice(
                              Number((shipping as { free_delivery_threshold?: number }).free_delivery_threshold),
                              product.currency,
                              tenantCurrency,
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    {(shipping as { estimated_delivery_days?: number | null }).estimated_delivery_days != null &&
                      Number((shipping as { estimated_delivery_days?: number }).estimated_delivery_days) > 0 && (
                        <p className="mt-1 text-xs text-gray-500">
                          Estimated delivery: within{" "}
                          {Number((shipping as { estimated_delivery_days?: number }).estimated_delivery_days)} business
                          day
                          {Number((shipping as { estimated_delivery_days?: number }).estimated_delivery_days) !== 1
                            ? "s"
                            : ""}
                        </p>
                      )}
                  </>
                )}
                {!offersCollection && !offersDelivery && (
                  <p className="text-sm text-gray-500">Ask the provider for delivery options.</p>
                )}
              </div>
            )}

            {offersCollection && collectionLocations.length > 0 && (
              <div className="mt-6 rounded-xl border border-gray-100 bg-white p-4">
                <h3 className="mb-3 font-semibold text-gray-900">Pickup locations</h3>
                <ul className="space-y-3 text-sm text-gray-600">
                  {collectionLocations.map((loc) => (
                    <li key={loc.id} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                      <p className="font-medium text-gray-900">{loc.name}</p>
                      {[loc.address_line1, loc.city, loc.state].filter(Boolean).length > 0 && (
                        <p className="mt-0.5">
                          {[loc.address_line1, loc.city, loc.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Link
              href={partnerProfileHref}
              className="mt-8 flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 transition hover:bg-gray-100"
            >
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gray-200">
                {product.provider.logo_url ? (
                  <Image src={product.provider.logo_url} alt="" width={40} height={40} className="object-cover" />
                ) : (
                  <span className="text-sm font-bold text-gray-500">{product.provider.business_name[0]}</span>
                )}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{product.provider.business_name}</p>
                <p className="text-xs text-gray-500">View profile &amp; book services</p>
              </div>
            </Link>
          </div>
        </div>

        {reviews.recent.length > 0 && (
          <div className="mt-14 md:mt-16">
            <h2 className="mb-6 text-xl font-bold text-gray-900">Reviews ({reviews.total_count})</h2>
            <div className="space-y-6">
              {reviews.recent.map((r) => (
                <div key={r.id} className="border-b border-gray-200 pb-6 last:border-0">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <Stars rating={r.rating} />
                    <span className="text-sm text-gray-500">{r.customer?.full_name}</span>
                    {r.is_verified_purchase && (
                      <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600">
                        Verified purchase
                      </span>
                    )}
                  </div>
                  {r.title ? <p className="mb-1 font-semibold text-gray-900">{r.title}</p> : null}
                  {r.comment ? <p className="text-sm leading-relaxed text-gray-600">{r.comment}</p> : null}
                  {r.provider_response ? (
                    <div className="mt-3 border-l-2 border-pink-500 pl-3">
                      <p className="text-xs text-gray-400">Provider response</p>
                      <p className="text-sm text-gray-700">{r.provider_response}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {related.length > 0 && (
          <div className="mt-14 md:mt-16">
            <h2 className="mb-6 text-xl font-bold text-gray-900">More from this provider</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((p) => {
                const rel = providerSlugParam
                  ? `/shop/${p.id}?provider=${encodeURIComponent(providerSlugParam)}`
                  : `/shop/${p.id}`;
                return (
                  <Link
                    key={p.id}
                    href={rel}
                    className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 transition hover:shadow-md"
                  >
                    <div className="relative aspect-square overflow-hidden bg-white">
                      {p.image_urls?.[0] ? (
                        <Image
                          src={p.image_urls[0]}
                          alt={p.name}
                          fill
                          className="object-contain p-2 transition group-hover:scale-[1.02]"
                          sizes="25vw"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-gray-300">
                          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1}
                              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-2 text-sm font-semibold text-gray-900">{p.name}</p>
                      <p className="mt-1 font-bold text-pink-600">
                        {formatPrice(p.retail_price, product.currency, tenantCurrency)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <Footer />
      <BottomNav />
    </div>
  );
}

export default function ProductDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white pb-20 md:pb-0">
          <BeautonomiHeader />
          <div className="flex min-h-[50vh] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600" />
          </div>
          <Footer />
          <BottomNav />
        </div>
      }
    >
      <ProductDetailContent />
    </Suspense>
  );
}
