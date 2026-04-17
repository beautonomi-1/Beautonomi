"use client";
import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { GlobalCategoryIcon } from "@/components/icons/GlobalCategoryIcon";
import { isGlobalCategoryIconImageUrl } from "@/lib/icons/global-category-lucide";

interface GlobalCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  display_order: number;
  is_featured: boolean;
  provider_count?: number;
}

const FALLBACK_CATEGORIES: GlobalCategory[] = [
  { id: "hair", name: "Hair", slug: "hair", icon: "/images/hairstylist_6672954.svg", display_order: 10, is_featured: true },
  { id: "nails", name: "Nails", slug: "nails", icon: "/images/nail-art.svg", display_order: 20, is_featured: true },
  { id: "braids", name: "Braids", slug: "braids", icon: "/images/braids.svg", display_order: 30, is_featured: true },
  { id: "makeup", name: "Makeup", slug: "makeup", icon: "/images/makeup.svg", display_order: 40, is_featured: true },
  { id: "massage", name: "Massage", slug: "massage", icon: "/images/massage.svg", display_order: 50, is_featured: true },
  { id: "dreadlocks", name: "Dreadlocks", slug: "dreadlocks", icon: "/images/dreadlocks.svg", display_order: 60, is_featured: true },
  { id: "brows-lashes", name: "Brows & Lashes", slug: "brows-lashes", icon: "/images/mascara.svg", display_order: 70, is_featured: true },
  { id: "natural-hair", name: "Natural Hair", slug: "natural-hair", icon: "/images/afro-natural-hair.svg", display_order: 80, is_featured: true },
  { id: "wigs-weaves", name: "Wigs & Weaves", slug: "wigs-weaves", icon: "/images/curling-hair.svg", display_order: 90, is_featured: true },
  { id: "skin-facials", name: "Skin & Facials", slug: "skin-facials", icon: "/images/facial-treatment.svg", display_order: 100, is_featured: true },
  { id: "hair-removal", name: "Hair Removal", slug: "hair-removal", icon: "/images/wax.svg", display_order: 110, is_featured: true },
  { id: "barber", name: "Barber", slug: "barber", icon: "/images/barbershop.svg", display_order: 120, is_featured: true },
  { id: "spa", name: "Spa", slug: "spa", icon: "/images/facial.svg", display_order: 130, is_featured: true },
];

const ServiceCategoriesNav = () => {
  const [categories, setCategories] = useState<GlobalCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCategories(FALLBACK_CATEGORIES);
    setActiveCategory(FALLBACK_CATEGORIES[0]?.slug ?? "");
    setIsLoading(false);

    const loadCategories = async () => {
      try {
        setIsLoading(true);
        const response = await fetcher.get<{
          data: GlobalCategory[];
          error: null | { message: string; code?: string };
        }>("/api/public/categories/global", { timeoutMs: 10000 });

        if (response.error) {
          console.warn("API returned error, using fallback categories:", response.error);
          throw new Error(response.error.message);
        }

        const fetchedCategories = response.data || [];

        if (fetchedCategories.length === 0) {
          console.warn("No categories returned from API, using fallback");
          setCategories(FALLBACK_CATEGORIES);
          setActiveCategory(FALLBACK_CATEGORIES[0]?.slug ?? "");
        } else {
          setCategories(fetchedCategories);
          setActiveCategory(fetchedCategories[0]?.slug ?? "");
        }
      } catch (err) {
        console.error("Error loading global categories:", err);
        setCategories(FALLBACK_CATEGORIES);
        setActiveCategory(FALLBACK_CATEGORIES[0]?.slug ?? "");
      } finally {
        setIsLoading(false);
      }
    };

    loadCategories();
  }, []);

  const _scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="border-b border-t border-gray-100 bg-white sticky top-[73px] md:top-[73px] z-40">
      <div className="max-w-[2340px] mx-auto px-2 md:px-8 lg:px-20">
        <div className="flex items-center justify-between gap-1 md:gap-0">
          <div
            ref={scrollContainerRef}
            className="flex-1 flex items-center gap-1 md:gap-3 overflow-x-auto px-2 md:px-4 hide-scrollbar"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {isLoading ? (
              <div className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-3">
                <span className="text-xs md:text-sm text-gray-500">Loading categories...</span>
              </div>
            ) : (
              categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/search?category=${encodeURIComponent(category.slug)}`}
                  onClick={() => setActiveCategory(category.slug)}
                  className={`relative flex flex-col items-center gap-1 px-2 md:px-4 py-2 md:py-3 text-[10px] md:text-sm font-medium whitespace-nowrap transition-colors border-b-2 min-w-[56px] md:min-w-[72px] ${
                    activeCategory === category.slug
                      ? "text-primary border-primary"
                      : "text-gray-600 border-transparent hover:text-gray-900"
                  }`}
                >
                  <GlobalCategoryIcon
                    icon={category.icon || "BeautonomiAll"}
                    size={22}
                    strokeWidth={1.75}
                    className={
                      isGlobalCategoryIconImageUrl(category.icon)
                        ? undefined
                        : "text-current"
                    }
                    isActive={activeCategory === category.slug}
                  />
                  <span>{category.name}</span>
                </Link>
              ))
            )}
            <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2 md:hidden" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceCategoriesNav;
