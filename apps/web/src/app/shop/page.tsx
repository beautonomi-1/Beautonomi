"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Product {
  id: string;
  name: string;
  slug: string | null;
  brand: string | null;
  category: string | null;
  retail_price: number;
  image_urls: string[];
  short_description: string | null;
  quantity: number;
  tags: string[];
  provider: { id: string; business_name: string; slug: string; logo_url: string | null };
}

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name", label: "Name A-Z" },
];

export default function ShopPage() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "newest");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "24");
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (sort) params.set("sort", sort);

    try {
      const res = await fetch(`/api/public/products?${params}`);
      const json = await res.json();
      if (json.data) {
        setProducts(json.data.products);
        setCategories(json.data.categories);
        setTotalPages(json.data.pagination.totalPages);
      }
    } catch {
      // error handling
    }
    setLoading(false);
  }, [page, search, category, sort]);

  useEffect(() => {
    const id = setTimeout(() => fetchProducts(), 0);
    return () => clearTimeout(id);
  }, [fetchProducts]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Shop Products</h1>
          <p className="mt-2 text-gray-500">Browse beauty products from top providers</p>
        </div>

        {/* Search and filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchProducts()}
              placeholder="Search products..."
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pl-10 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
            <svg className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:border-pink-500 focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Category filter */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => { setCategory(""); setPage(1); }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              !category ? "bg-pink-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => { setCategory(c); setPage(1); }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                category === c ? "bg-pink-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Product grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <svg className="mb-4 h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-lg font-medium">No products found</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:gap-6">
              {products.map((product) => (
                <Link
                  key={product.id}
                  href={`/shop/${product.id}`}
                  className="group overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-md"
                >
                  <div className="relative aspect-square overflow-hidden bg-gray-100">
                    {product.image_urls[0] ? (
                      <Image
                        src={product.image_urls[0]}
                        alt={product.name}
                        fill
                        className="object-cover transition group-hover:scale-105"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    {product.brand && (
                      <p className="mb-1 text-xs font-medium text-gray-400">{product.brand}</p>
                    )}
                    <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">{product.name}</h3>
                    <p className="mt-1 text-xs text-gray-500">{product.provider.business_name}</p>
                    <p className="mt-2 text-lg font-bold text-pink-600">R{product.retail_price.toFixed(2)}</p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-4 text-sm text-gray-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
