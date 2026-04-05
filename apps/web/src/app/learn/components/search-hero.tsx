"use client";

import React, { useEffect, useRef, useState } from "react";
import { useLearnContext } from "../learn-context";
import { SearchWithSuggestions } from "./search-with-suggestions";
import { cn } from "@/lib/utils";

export function SearchHero({
  title = "Beautonomi Learning Center",
  subtitle = "Find guides and answers for customers and providers.",
}: {
  title?: string;
  subtitle?: string;
} = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const { setSearchHeroVisible } = useLearnContext();
  const [searchQ, setSearchQ] = useState("");
  const [sticky, setSticky] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setSearchHeroVisible(entry?.isIntersecting ?? false);
        setSticky(!(entry?.isIntersecting ?? false));
      },
      { threshold: 0.1, rootMargin: "0px 0px -20% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [setSearchHeroVisible]);

  return (
    <>
      {/* Mobile: sticky glass pill when hero scrolled out */}
      {sticky && (
        <div className="md:hidden sticky top-[57px] z-30 px-4 py-2 -mx-4 md:mx-0 md:p-0 backdrop-blur-xl bg-zinc-50/90 border-b border-zinc-200/50 transition-all duration-200 ease-in-out">
          <div className="rounded-full shadow-inner bg-white/80 border border-zinc-200/50">
            <SearchWithSuggestions
              value={searchQ}
              onChange={setSearchQ}
              placeholder="Search articles..."
              size="sm"
              variant="hero"
            />
          </div>
        </div>
      )}

      <section
        ref={ref}
        className={cn(
          "pt-2 pb-8 md:pb-10 transition-all duration-200 ease-in-out",
          sticky && "md:pt-2"
        )}
      >
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-black">{title}</h1>
        <p className="mt-2 text-sm text-zinc-600 md:text-base">{subtitle}</p>
        {/* Search-First Hero: centered, minimalist, rounded-[24px], shadow-inner pill, ⌘K */}
        <div className="mt-6 max-w-2xl mx-auto">
          <div className="rounded-[24px] p-2 md:p-3 bg-zinc-50 border border-zinc-200/50">
            <SearchWithSuggestions
              value={searchQ}
              onChange={setSearchQ}
              placeholder="Search articles..."
              size="lg"
              showKbd
              variant="hero"
            />
          </div>
        </div>
      </section>
    </>
  );
}
