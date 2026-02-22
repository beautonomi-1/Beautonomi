"use client";
import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";

interface GlobalCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  display_order: number;
  is_featured: boolean;
  provider_count?: number;
}

const ServiceCategoriesNav = () => {
  const [categories, setCategories] = useState<GlobalCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Set fallback categories immediately so page can render
    const fallbackCategories = [
      { id: "makeup", name: "Makeup", slug: "makeup", icon: "💄", display_order: 0, is_featured: true },
      { id: "hair", name: "Hair", slug: "hair", icon: "✂️", display_order: 1, is_featured: true },
      { id: "nail", name: "Nail", slug: "nail", icon: "💅", display_order: 2, is_featured: true },
      { id: "cutting", name: "Cutting", slug: "cutting", icon: "✂️", display_order: 3, is_featured: true },
      { id: "facial", name: "Facial", slug: "facial", icon: "✨", display_order: 4, is_featured: true },
      { id: "eyebrow", name: "Eyebrow", slug: "eyebrow", icon: "👁️", display_order: 5, is_featured: true },
      { id: "massage", name: "Massage", slug: "massage", icon: "💆", display_order: 6, is_featured: true },
      { id: "beard", name: "Beard", slug: "beard", icon: "🧔", display_order: 7, is_featured: true },
    ];
    setCategories(fallbackCategories);
    setActiveCategory("makeup");
    setIsLoading(false);

    const loadCategories = async () => {
      try {
        setIsLoading(true);
        const response = await fetcher.get<{
          data: GlobalCategory[];
          error: null | { message: string; code?: string };
        }>("/api/public/categories/global", { timeoutMs: 10000 });
        
        // Check if response has error
        if (response.error) {
          console.warn("API returned error, using fallback categories:", response.error);
          throw new Error(response.error.message);
        }
        
        const fetchedCategories = response.data || [];
        
        // If no categories returned, use fallback
        if (fetchedCategories.length === 0) {
          console.warn("No categories returned from API, using fallback");
          // Use fallback categories instead of throwing error
          const fallbackCategories = [
            { id: "makeup", name: "Makeup", slug: "makeup", icon: "💄", display_order: 0, is_featured: true },
            { id: "hair", name: "Hair", slug: "hair", icon: "✂️", display_order: 1, is_featured: true },
            { id: "nail", name: "Nail", slug: "nail", icon: "💅", display_order: 2, is_featured: true },
            { id: "cutting", name: "Cutting", slug: "cutting", icon: "✂️", display_order: 3, is_featured: true },
            { id: "facial", name: "Facial", slug: "facial", icon: "✨", display_order: 4, is_featured: true },
            { id: "eyebrow", name: "Eyebrow", slug: "eyebrow", icon: "👁️", display_order: 5, is_featured: true },
            { id: "massage", name: "Massage", slug: "massage", icon: "💆", display_order: 6, is_featured: true },
            { id: "beard", name: "Beard", slug: "beard", icon: "🧔", display_order: 7, is_featured: true },
          ];
          setCategories(fallbackCategories);
          setActiveCategory("makeup");
        } else {
          setCategories(fetchedCategories);
          setActiveCategory(fetchedCategories[0].slug);
        }
      } catch (err) {
        console.error("Error loading global categories:", err);
        // Fallback to default categories if API fails
        const fallbackCategories = [
          { id: "makeup", name: "Makeup", slug: "makeup", icon: "💄", display_order: 0, is_featured: true },
          { id: "hair", name: "Hair", slug: "hair", icon: "✂️", display_order: 1, is_featured: true },
          { id: "nail", name: "Nail", slug: "nail", icon: "💅", display_order: 2, is_featured: true },
          { id: "cutting", name: "Cutting", slug: "cutting", icon: "✂️", display_order: 3, is_featured: true },
          { id: "facial", name: "Facial", slug: "facial", icon: "✨", display_order: 4, is_featured: true },
          { id: "eyebrow", name: "Eyebrow", slug: "eyebrow", icon: "👁️", display_order: 5, is_featured: true },
          { id: "massage", name: "Massage", slug: "massage", icon: "💆", display_order: 6, is_featured: true },
          { id: "beard", name: "Beard", slug: "beard", icon: "🧔", display_order: 7, is_featured: true },
        ];
        setCategories(fallbackCategories);
        setActiveCategory("makeup");
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
    <div className="border-b bg-white sticky top-[73px] md:top-[73px] z-40">
      <div className="max-w-[2340px] mx-auto px-2 md:px-8 lg:px-20">
        <div className="flex items-center justify-between gap-1 md:gap-0">
          {/* Categories */}
          <div
            ref={scrollContainerRef}
            className="flex-1 flex items-center gap-1 md:gap-2 overflow-x-auto px-2 md:px-4 hide-scrollbar"
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
                  className={`flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm font-normal whitespace-nowrap transition-colors border-b-2 ${
                    activeCategory === category.slug
                      ? "text-[#FF0077] border-[#FF0077]"
                      : "text-gray-600 border-transparent hover:text-gray-900"
                  }`}
                >
                  <span className="text-base md:text-lg">{category.icon || "📦"}</span>
                  <span>{category.name}</span>
                </Link>
              ))
            )}
            <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceCategoriesNav;
