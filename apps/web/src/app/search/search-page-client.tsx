"use client";

import React, { Suspense, useEffect } from "react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import SearchResults from "./components/search-results";
import BottomNav from "@/components/layout/bottom-nav";
import Footer from "@/components/layout/footer";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_SEARCH_VIEW } from "@/lib/analytics/amplitude/types";
import type { Category } from "@/types/beautonomi";

function SearchPageInner({ initialCategories }: { initialCategories: Category[] }) {
  const { track, isReady } = useAmplitude();
  useEffect(() => {
    if (isReady) track(EVENT_SEARCH_VIEW);
  }, [isReady, track]);

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader />
      <SearchResults initialCategories={initialCategories} />
      <Footer />
      <BottomNav />
    </div>
  );
}

export default function SearchPageClient({
  initialCategories,
}: {
  initialCategories: Category[];
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white pb-20 md:pb-0 flex items-center justify-center text-sm text-zinc-500">
          Loading search…
        </div>
      }
    >
      <SearchPageInner initialCategories={initialCategories} />
    </Suspense>
  );
}
