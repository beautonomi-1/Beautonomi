"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

interface ProductDetail {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  short_description: string | null;
  long_description: string | null;
  description: string | null;
  retail_price: number;
  image_urls: string[];
  quantity: number;
  tags: string[];
  provider: { id: string; business_name: string; slug: string; logo_url: string | null };
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

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [reviews, setReviews] = useState<{ average_rating: number; total_count: number; recent: Review[] }>({
    average_rating: 0,
    total_count: 0,
    recent: [],
  });
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [shipping, setShipping] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartMessage, setCartMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const handleAddToCart = useCallback(async () => {
    if (!product || addingToCart) return;
    setAddingToCart(true);
    setCartMessage(null);
    try {
      const res = await fetch("/api/me/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: product.id, quantity }),
      });
      const json = await res.json();
      if (res.ok) {
        setCartMessage({ text: "Added to cart!", type: "success" });
        setTimeout(() => setCartMessage(null), 3000);
      } else {
        setCartMessage({ text: json.error || "Failed to add to cart", type: "error" });
      }
    } catch {
      setCartMessage({ text: "Something went wrong", type: "error" });
    }
    setAddingToCart(false);
  }, [product, quantity, addingToCart]);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/public/products/${params.id}`);
        const json = await res.json();
        if (json.data) {
          setProduct(json.data.product);
          setReviews(json.data.reviews);
          setRelated(json.data.related_products);
          setShipping(json.data.shipping);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center text-gray-400">
        <p className="text-lg">Product not found</p>
        <button onClick={() => router.back()} className="mt-4 text-pink-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const desc = product.long_description || product.description || product.short_description;
  const inStock = product.quantity > 0;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Shop
        </button>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Images */}
          <div>
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-gray-100">
              {product.image_urls[activeImage] ? (
                <Image
                  src={product.image_urls[activeImage]}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-300">
                  <svg className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              )}
            </div>
            {product.image_urls.length > 1 && (
              <div className="mt-4 flex gap-3">
                {product.image_urls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`relative h-20 w-20 overflow-hidden rounded-xl border-2 transition ${
                      i === activeImage ? "border-pink-500" : "border-transparent"
                    }`}
                  >
                    <Image src={url} alt="" fill className="object-cover" sizes="80px" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            {product.brand && <p className="mb-1 text-sm font-medium text-gray-400">{product.brand}</p>}
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{product.name}</h1>

            <div className="mt-3 flex items-center gap-4">
              <span className="text-3xl font-extrabold text-pink-600">R{product.retail_price.toFixed(2)}</span>
              {reviews.total_count > 0 && (
                <div className="flex items-center gap-2">
                  <Stars rating={reviews.average_rating} />
                  <span className="text-sm text-gray-500">({reviews.total_count})</span>
                </div>
              )}
            </div>

            <div className={`mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold ${
              inStock ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
            }`}>
              {inStock ? `In Stock (${product.quantity})` : "Out of Stock"}
            </div>

            {desc && <p className="mt-6 leading-relaxed text-gray-600">{desc}</p>}

            {/* Quantity + Add to Cart */}
            {inStock && (
              <>
              <div className="mt-8 flex items-center gap-4">
                <div className="flex items-center rounded-xl border border-gray-200">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-4 py-3 text-gray-600 hover:text-gray-900"
                  >
                    -
                  </button>
                  <span className="min-w-[40px] text-center font-bold">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(product.quantity, quantity + 1))}
                    className="px-4 py-3 text-gray-600 hover:text-gray-900"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={handleAddToCart}
                  disabled={addingToCart}
                  className="flex-1 rounded-xl bg-pink-600 px-8 py-4 text-center font-bold text-white transition hover:bg-pink-700 disabled:opacity-50"
                >
                  {addingToCart ? "Adding..." : `Add to Cart — R${(product.retail_price * quantity).toFixed(2)}`}
                </button>
              </div>
              {cartMessage && (
                <div className={`mt-3 rounded-lg px-4 py-3 text-sm font-medium ${
                  cartMessage.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                }`}>
                  {cartMessage.text}
                  {cartMessage.type === "success" && (
                    <Link href="/cart" className="ml-2 underline">View Cart</Link>
                  )}
                </div>
              )}
            </>
            )}

            {/* Shipping info */}
            {shipping && (
              <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-3 font-semibold text-gray-900">Delivery & Collection</h3>
                {shipping.offers_collection && (
                  <div className="mb-2 flex items-center gap-2 text-sm text-gray-600">
                    <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Available for collection
                  </div>
                )}
                {shipping.offers_delivery && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Delivery: R{Number(shipping.delivery_fee).toFixed(2)}
                    {shipping.free_delivery_threshold && ` (Free over R${Number(shipping.free_delivery_threshold).toFixed(0)})`}
                  </div>
                )}
              </div>
            )}

            {/* Provider */}
            <Link
              href={`/provider/${product.provider.slug}`}
              className="mt-6 flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 transition hover:bg-gray-100"
            >
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gray-200">
                {product.provider.logo_url ? (
                  <Image src={product.provider.logo_url} alt="" width={40} height={40} className="object-cover" />
                ) : (
                  <span className="text-sm font-bold text-gray-500">
                    {product.provider.business_name[0]}
                  </span>
                )}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{product.provider.business_name}</p>
                <p className="text-xs text-gray-500">View Profile</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Reviews */}
        {reviews.recent.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-6 text-xl font-bold text-gray-900">Reviews ({reviews.total_count})</h2>
            <div className="space-y-6">
              {reviews.recent.map((r) => (
                <div key={r.id} className="border-b border-gray-100 pb-6">
                  <div className="mb-2 flex items-center gap-3">
                    <Stars rating={r.rating} />
                    <span className="text-sm text-gray-500">{r.customer?.full_name}</span>
                    {r.is_verified_purchase && (
                      <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600">
                        Verified
                      </span>
                    )}
                  </div>
                  {r.title && <p className="mb-1 font-semibold text-gray-900">{r.title}</p>}
                  {r.comment && <p className="text-sm leading-relaxed text-gray-600">{r.comment}</p>}
                  {r.provider_response && (
                    <div className="mt-3 border-l-2 border-pink-500 pl-3">
                      <p className="text-xs text-gray-400">Provider Response</p>
                      <p className="text-sm text-gray-700">{r.provider_response}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-6 text-xl font-bold text-gray-900">More from this provider</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {related.map((p) => (
                <Link key={p.id} href={`/shop/${p.id}`} className="group overflow-hidden rounded-xl bg-white shadow-sm transition hover:shadow-md">
                  <div className="relative aspect-square overflow-hidden bg-gray-100">
                    {p.image_urls[0] ? (
                      <Image src={p.image_urls[0]} alt={p.name} fill className="object-cover transition group-hover:scale-105" sizes="25vw" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-gray-300">
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-gray-900">{p.name}</p>
                    <p className="mt-1 font-bold text-pink-600">R{p.retail_price.toFixed(2)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
