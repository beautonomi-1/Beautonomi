"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { SearchHero } from "./components/search-hero";
import { useLearnContext } from "./learn-context";
import { ChevronRight, Search, Users, Briefcase, ArrowRight, Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LearnHomePayload } from "@/lib/learn/public-queries";
import { normalizeLearnCtaHref } from "@/lib/learn/normalize-learn-cta-href";

export default function LearnHomeClient({ initialData }: { initialData: LearnHomePayload }) {
  const { setSearchHeroVisible, setSearchOverlayOpen } = useLearnContext();
  const [activePlatformTab, setActivePlatformTab] = useState<"web" | "mobile">("web");

  useEffect(() => {
    setSearchHeroVisible(true);
    return () => setSearchHeroVisible(false);
  }, [setSearchHeroVisible]);

  const cards = initialData.cta_cards?.cards ?? [];
  const featured = Array.isArray(initialData.featured_articles) ? initialData.featured_articles : [];
  const platformTabs = Array.isArray(initialData.platform_guides?.tabs) ? initialData.platform_guides.tabs : [];
  const activeGuideTab = platformTabs.find((tab) => tab.id === activePlatformTab) ?? platformTabs[0];

  return (
    <div className="space-y-10 pb-24 md:pb-10">
      <SearchHero title={initialData.hero?.title} subtitle={initialData.hero?.subtitle} />

      {platformTabs.length > 0 && activeGuideTab && (
        <section className="rounded-[32px] border border-zinc-200/70 bg-white p-4 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.35)] md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[#ff0077]">Choose your experience</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-black">Guides for web and mobile app</h2>
              <p className="mt-2 max-w-2xl text-sm text-zinc-600">
                Learn the customer and provider flows in the right context, with direct links to current navigation and features.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-full bg-zinc-100 p-1">
              {platformTabs.map((tab) => {
                const Icon = tab.id === "mobile" ? Smartphone : Monitor;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActivePlatformTab(tab.id)}
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                      activeGuideTab.id === tab.id
                        ? "bg-black text-white shadow-sm"
                        : "text-zinc-600 hover:bg-white hover:text-black"
                    )}
                    aria-pressed={activeGuideTab.id === tab.id}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 rounded-[24px] bg-zinc-50 p-4 md:p-5">
            <p className="text-sm text-zinc-600">{activeGuideTab.description}</p>
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {activeGuideTab.groups.map((group) => {
                const GroupIcon = group.audience === "provider" ? Briefcase : Users;
                return (
                  <div key={`${activeGuideTab.id}-${group.audience}`} className="rounded-[22px] border border-zinc-200/70 bg-white p-4">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#ff0077]/10">
                        <GroupIcon className="h-5 w-5 text-[#ff0077]" aria-hidden />
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{group.audience}</p>
                        <h3 className="font-semibold text-black">{group.title}</h3>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {group.cards.map((card) => (
                        <Link
                          key={card.href}
                          href={card.href}
                          className={cn(
                            "group flex items-center gap-3 rounded-2xl border border-zinc-200/50 px-4 py-3",
                            "transition-all duration-200 hover:border-[#ff0077]/25 hover:bg-[#ff0077]/5 active:scale-[0.99]"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-black">{card.title}</p>
                            <p className="mt-0.5 text-sm text-zinc-600">{card.description}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#ff0077]" />
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

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
