"use client";

import React from "react";
import { Star } from "lucide-react";
import { usePageContent } from "@/hooks/usePageContent";

export default function RatingSection() {
  const { getSectionContent } = usePageContent("become-a-partner");
  const ratingText = getSectionContent("rating_text") || "#1 highest-rated by thousands of beauty & wellness professionals";

  return (
    <div className="py-8 sm:py-12 md:py-16 bg-white border-y border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
        </div>
        <p className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 mb-1">
          {ratingText.includes('<') ? (
            <span dangerouslySetInnerHTML={{ __html: ratingText }} />
          ) : (
            ratingText
          )}
        </p>
      </div>
    </div>
  );
}
