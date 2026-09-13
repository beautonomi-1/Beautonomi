"use client";

import React, { Suspense, useEffect } from "react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import SearchResults from "./components/search-results";
import BottomNav from "@/components/layout/bottom-nav";
import Footer from "@/components/layout/footer";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_SEARCH_VIEW } from "@/lib/analytics/amplitude/types";
import type { Category } from "@/types/beautonomi";
import { useTranslation } from "@beautonomi/i18n";

function SearchPageInner({ initialCategories }: { initialCategories: Category[] }) {
  const { track, isReady } = useAmplitude();
  useEffect(() => {
    if (isReady) track(EVENT_SEARCH_VIEW);
  }, [isReady, track]);

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 w-full max-w-full">
      <BeautonomiHeader />
      <div className="w-full max-w-full overflow-x-hidden">
        <SearchResults initialCategories={initialCategories} />
      </div>
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
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white pb-20 md:pb-0 flex items-center justify-center text-sm text-zinc-500">
          {t("web.search.loading")}
        </div>
      }
    >
      <SearchPageInner initialCategories={initialCategories} />
    </Suspense>
  );
}
