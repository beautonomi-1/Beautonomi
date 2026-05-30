"use client";

import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShoppingBag, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@beautonomi/i18n";

interface Product {
  id: string;
  name: string;
  description: string;
  category: string | null;
  price: number;
  currency: string;
  imageUrl: string | null;
  inStock: boolean;
  quantity: number;
  track_stock_quantity: boolean;
  hasVariants?: boolean;
}

interface PartnerProductsProps {
  slug: string;
}

const PRODUCTS_PER_PAGE = 12;
const MANY_PRODUCTS = 16;
const MANY_CATEGORY_PILLS = 10;

export default function PartnerProducts({ slug }: PartnerProductsProps) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [productPage, setProductPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const categoryBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const shopHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetcher.get<{ data: Product[]; error?: unknown }>(
          `/api/public/providers/${encodeURIComponent(slug)}/products`,
        );
        if (!cancelled && res?.data) setProducts(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const categoryPills = useMemo(() => {
    const named = new Set<string>();
    let hasUncat = false;
    for (const p of products) {
      if (p.category && p.category.trim()) named.add(p.category.trim());
      else hasUncat = true;
    }
    const sorted = [...named].sort((a, b) => a.localeCompare(b));
    return ["All", ...sorted, ...(hasUncat ? ["Other"] : [])] as string[];
  }, [products]);

  const filtered = useMemo(() => {
    let list =
      activeCategory === "All"
        ? products
        : activeCategory === "Other"
          ? products.filter((p) => !p.category || !p.category.trim())
          : products.filter((p) => (p.category || "").trim() === activeCategory);
    const q = productSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [products, activeCategory, productSearch]);

  const displayedCategoryPills = useMemo(() => {
    const q = categoryFilter.trim().toLowerCase();
    let list = categoryPills;
    if (q && categoryPills.length >= MANY_CATEGORY_PILLS) {
      list = categoryPills.filter((label) => label.toLowerCase().includes(q));
    }
    if (activeCategory !== "All" && !list.includes(activeCategory)) {
      list = [activeCategory, ...list];
    }
    return list;
  }, [categoryPills, categoryFilter, activeCategory]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / PRODUCTS_PER_PAGE)),
    [filtered.length],
  );

  const effectivePage = Math.min(productPage, totalPages);

  const pagedProducts = useMemo(() => {
    const start = (effectivePage - 1) * PRODUCTS_PER_PAGE;
    return filtered.slice(start, start + PRODUCTS_PER_PAGE);
  }, [filtered, effectivePage]);

  const showProductSearch = products.length >= MANY_PRODUCTS || filtered.length >= MANY_PRODUCTS;
  const showCategoryFilter = categoryPills.length >= MANY_CATEGORY_PILLS;

  useEffect(() => {
    setProductPage(1);
  }, [activeCategory, productSearch]);

  useEffect(() => {
    if (productPage > totalPages) setProductPage(totalPages);
  }, [productPage, totalPages]);

  useLayoutEffect(() => {
    if (categoryPills.length <= 1) return;
    const btn = categoryBtnRefs.current.get(activeCategory);
    btn?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeCategory, categoryPills.length, displayedCategoryPills.length]);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "left" ? -200 : 200, behavior: "smooth" });
    }
  };

  const handlePageChange = (page: number) => {
    const next = Math.max(1, Math.min(page, totalPages));
    setProductPage(next);
    shopHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <LoadingTimeout loadingMessage="Loading shop..." />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-12 text-center">
        <ShoppingBag className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">No products available yet</p>
      </div>
    );
  }

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-6 md:py-8">
      <h2 ref={shopHeadingRef} className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">
        Shop
      </h2>

      {categoryPills.length > 1 && (
        <div className="relative mb-6 md:mb-8 space-y-3">
          {showCategoryFilter && (
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
              <Input
                type="search"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                placeholder={t("booking.filterCategoriesPlaceholder")}
                className="pl-9 h-10 placeholder:text-gray-400 border border-gray-200 bg-white"
                aria-label={t("booking.filterCategoriesPlaceholder")}
              />
            </div>
          )}
          <div className="flex items-center">
            <div
              ref={scrollRef}
              className="flex space-x-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 md:mx-0 md:px-0"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              role="tablist"
            >
              {displayedCategoryPills.map((label) => (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={label === activeCategory}
                  ref={(el) => {
                    if (el) categoryBtnRefs.current.set(label, el);
                    else categoryBtnRefs.current.delete(label);
                  }}
                  onClick={() => {
                    setActiveCategory(label);
                    setProductSearch("");
                  }}
                  className={`py-2.5 px-5 rounded-full text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 border ${
                    label === activeCategory
                      ? "bg-[#FF0077] text-white border-[#FF0077] shadow-md shadow-pink-500/20"
                      : "bg-white text-gray-800 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => scroll("left")}
              className="absolute left-0 bg-white p-1 rounded-full shadow-md hidden md:block -ml-2 z-10"
              aria-label="Scroll categories left"
            >
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              className="absolute right-0 bg-white p-1 rounded-full shadow-md hidden md:block -mr-2 z-10"
              aria-label="Scroll categories right"
            >
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      )}

      {showProductSearch && (
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
          <Input
            type="search"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder={t("booking.searchProductsPlaceholder")}
            className="pl-9 h-10 placeholder:text-gray-400 border border-gray-200 bg-white"
            aria-label={t("booking.searchProductsPlaceholder")}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No products in this category.</p>
      ) : (
        <>
          <div className="rounded-3xl border border-gray-100 bg-gradient-to-b from-gray-50/80 to-white p-4 md:p-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8">
            {pagedProducts.map((p) => (
              <Link
                key={p.id}
                href={`/shop/${p.id}?provider=${encodeURIComponent(slug)}`}
                className="group rounded-3xl border border-gray-200/90 bg-white overflow-hidden shadow-sm hover:border-[#FF0077]/40 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF0077]/30"
              >
                <div className="aspect-square bg-white relative ring-1 ring-inset ring-gray-100 rounded-t-2xl">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      fill
                      className="object-contain p-3 group-hover:scale-[1.02] transition-transform"
                      sizes="(max-width: 640px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag className="h-10 w-10 text-gray-300" />
                    </div>
                  )}
                  {!p.inStock && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white text-sm font-medium">Out of stock</span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  {p.category ? (
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-0.5 line-clamp-1">
                      {p.category}
                    </p>
                  ) : null}
                  <p className="font-medium text-gray-900 text-sm line-clamp-2">{p.name}</p>
                  <p className="mt-1 text-sm font-semibold text-[#FF0077]">
                    {p.hasVariants ? "From " : ""}
                    {p.currency} {p.price.toFixed(2)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          {totalPages > 1 && (
            <nav
              className="mt-6 flex flex-wrap items-center justify-center gap-2"
              aria-label="Product list pagination"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={effectivePage <= 1}
                onClick={() => handlePageChange(effectivePage - 1)}
                aria-label={t("booking.productsPaginationPrevious")}
              >
                {t("booking.productsPaginationPrevious")}
              </Button>
              <span className="px-2 text-sm text-gray-500" aria-live="polite">
                {t("booking.productsPageOf", { page: effectivePage, totalPages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={effectivePage >= totalPages}
                onClick={() => handlePageChange(effectivePage + 1)}
                aria-label={t("booking.productsPaginationNext")}
              >
                {t("booking.productsPaginationNext")}
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
