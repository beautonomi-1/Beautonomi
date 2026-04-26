"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { SearchHero } from "./components/search-hero";
import { useLearnContext } from "./learn-context";
import { ChevronRight, Search, Users, Briefcase, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LearnHomePayload } from "@/lib/learn/public-queries";
import { normalizeLearnCtaHref } from "@/lib/learn/normalize-learn-cta-href";

export default function LearnHomeClient({ initialData }: { initialData: LearnHomePayload }) {
  const { setSearchHeroVisible, setSearchOverlayOpen } = useLearnContext();

  useEffect(() => {
    setSearchHeroVisible(true);
    return () => setSearchHeroVisible(false);
  }, [setSearchHeroVisible]);

  const cards = initialData.cta_cards?.cards ?? [];
  const featured = Array.isArray(initialData.featured_articles) ? initialData.featured_articles : [];

  return (
    <div className="space-y-10 pb-24 md:pb-10">
      <SearchHero title={initialData.hero?.title} subtitle={initialData.hero?.subtitle} />

      {cards.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
            Get started
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cards.map((card, i) => {
              const isProvider =
                card.title.toLowerCase().includes("provider") ||
                (card.link ?? "").toLowerCase().includes("provider");
              const Icon = isProvider ? Briefcase : Users;
              const href = normalizeLearnCtaHref(card.link, isProvider);
              return (
                <Link
                  key={i}
                  href={href}
                  className={cn(
                    "group flex flex-col rounded-[24px] border border-zinc-200/50 bg-white p-6",
                    "transition-all duration-200 ease-in-out",
                    "hover:shadow-[0_0_20px_-5px_rgba(255,0,119,0.15)] hover:border-[#ff0077]/30 hover:-translate-y-0.5",
                    "active:scale-[0.97]"
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-zinc-200/50 bg-zinc-50 group-hover:bg-[#ff0077]/5 transition-colors duration-200">
                      <Icon className="h-6 w-6 text-zinc-600 group-hover:text-[#ff0077] transition-colors duration-200" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-black text-base">{card.title}</h3>
                      <p className="mt-1 text-sm text-zinc-600">{card.description}</p>
                    </div>
                  </div>
                  <div className="mt-6">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium",
                        "bg-[#ff0077] text-white shadow-sm",
                        "transition-all duration-200 ease-in-out group-hover:bg-[#ff0077]/90 group-active:scale-[0.97]"
                      )}
                    >
                      {isProvider ? "Explore topics" : "Browse topics"}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
            Featured articles
          </h2>
          <ul className="space-y-0 rounded-[24px] border border-zinc-200/50 bg-white overflow-hidden divide-y divide-zinc-200/50">
            {featured.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/learn/article/${a.slug}`}
                  className={cn(
                    "flex min-h-[56px] items-center gap-3 px-4 md:px-6 py-3 text-left",
                    "transition-all duration-200 ease-in-out hover:bg-zinc-50 active:scale-[0.99]"
                  )}
                >
                  <span className="flex-1 font-medium text-black text-sm">{a.title}</span>
                  {a.summary && (
                    <span className="hidden sm:block flex-1 text-xs text-zinc-500 truncate max-w-xs">
                      {a.summary}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {featured.length === 0 && cards.length === 0 && (
        <p className="text-sm text-zinc-600">Browse topics from the sidebar to find articles.</p>
      )}

      <div className="fixed bottom-6 right-6 z-30 md:hidden">
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg bg-[#ff0077] hover:bg-[#ff0077]/90 text-white transition-all duration-200 ease-in-out active:scale-95"
          onClick={() => setSearchOverlayOpen(true)}
          aria-label="Search articles"
        >
          <Search className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
