"use client";

import React from "react";
import { ImageIcon, Bookmark } from "lucide-react";
import Link from "next/link";

interface ExploreEmptyStateProps {
  saved?: boolean;
}

export function ExploreEmptyState({ saved = false }: ExploreEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {saved ? (
        <>
          <Bookmark className="w-16 h-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No saved posts yet
          </h3>
          <p className="text-gray-500 mb-6 max-w-sm">
            Save posts you like by tapping the bookmark icon. They&apos;ll appear
            here.
          </p>
          <Link
            href="/explore"
            className="text-[#FF0077] font-medium hover:underline"
          >
            Explore the feed
          </Link>
        </>
      ) : (
        <>
          <ImageIcon className="w-16 h-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No posts yet
          </h3>
          <p className="text-gray-500 max-w-sm">
            Providers haven&apos;t shared any posts. Check back soon!
          </p>
        </>
      )}
    </div>
  );
}
