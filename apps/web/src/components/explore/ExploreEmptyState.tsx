"use client";

import React from "react";
import { ImageIcon, Bookmark } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@beautonomi/i18n";

interface ExploreEmptyStateProps {
  saved?: boolean;
}

export function ExploreEmptyState({ saved = false }: ExploreEmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {saved ? (
        <>
          <Bookmark className="w-16 h-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t("web.explore.feed.noSavedPosts")}
          </h3>
          <p className="text-gray-500 mb-6 max-w-sm">
            {t("web.explore.feed.noSavedPostsHint")}
          </p>
          <Link
            href="/explore"
            className="text-[#FF0077] font-medium hover:underline"
          >
            {t("web.explore.feed.exploreTheFeed")}
          </Link>
        </>
      ) : (
        <>
          <ImageIcon className="w-16 h-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t("web.explore.feed.noPostsYet")}
          </h3>
          <p className="text-gray-500 max-w-sm">
            {t("web.explore.feed.noPostsHint")}
          </p>
        </>
      )}
    </div>
  );
}
