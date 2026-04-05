"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Star } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

type Review = {
  id: string;
  reviewerName: string;
  reviewerInitial: string;
  date: string;
  rating: number;
  text: string;
  avatar_url?: string;
};

interface PartnerReviewsProps {
  slug?: string;
  rating?: number;
  review_count?: number;
}

const PartnerReviews: React.FC<PartnerReviewsProps> = ({
  slug,
  rating = 0,
  review_count = 0,
}) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const loadReviews = async () => {
      if (!slug) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: { reviews: Review[]; total: number };
          error: null;
        }>(`/api/public/providers/${slug}/reviews?limit=20`);
        setReviews(response.data.reviews || []);
      } catch (err) {
        const errorMessage =
          err instanceof FetchError
            ? err.message
            : "Failed to load reviews";
        setError(errorMessage);
        console.error("Error loading reviews:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadReviews();
  }, [slug]);

  const overallRating = rating || 0;
  const voteCount = review_count || 0;
  const displayedReviews = showAll ? reviews : reviews.slice(0, 6);
  const ratingsBreakdown = [5, 4, 3, 2, 1].map((stars) => {
    const count = reviews.filter((item) => Math.round(item.rating) === stars).length;
    const percent = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
    return { stars, count, percent };
  });

  const sanitizeReviewerName = (name: string) => {
    if (!name || /anon/i.test(name.trim())) return "Verified customer";
    return name;
  };

  if (isLoading) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <LoadingTimeout loadingMessage="Loading reviews..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <EmptyState
          title="Failed to load reviews"
          description={error}
        />
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <h2 className="text-2xl font-semibold mb-6">Reviews</h2>
        <EmptyState
          title="No reviews yet"
          description="This provider hasn't received any reviews yet. Be the first to review!"
        />
      </div>
    );
  }

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <section className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-5 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
          Customer reviews
        </p>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
              <span className="text-3xl font-semibold leading-none text-gray-900 md:text-4xl">
                {overallRating.toFixed(1)}
              </span>
            </div>
            <span className="pb-1 text-sm text-gray-600">
              {voteCount.toLocaleString()} {voteCount === 1 ? "review" : "reviews"}
            </span>
          </div>
          <div className="w-full md:max-w-sm">
            {ratingsBreakdown.map((row) => (
              <div key={row.stars} className="flex items-center gap-2 py-1">
                <span className="w-3 text-right text-xs font-medium text-gray-600">{row.stars}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
                <span className="w-8 text-xs text-gray-500">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {displayedReviews.map((review) => {
          const reviewerName = sanitizeReviewerName(review.reviewerName);
          return (
            <article key={review.id} className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative h-11 w-11 flex-shrink-0">
                    {review.avatar_url ? (
                      <Image
                        src={review.avatar_url}
                        alt={reviewerName}
                        width={44}
                        height={44}
                        className="rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-700">
                        {(reviewerName.charAt(0) || review.reviewerInitial || "C").toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 md:text-base">{reviewerName}</p>
                    <p className="text-xs text-gray-500 md:text-sm">{review.date}</p>
                  </div>
                </div>
                <div className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                  <div className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-semibold">{review.rating.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${i < Math.round(review.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
                  />
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-700 md:text-[15px]">{review.text}</p>
            </article>
          );
        })}
      </div>

      {!showAll && reviews.length > 6 && (
        <div className="mt-6">
          <button
            onClick={() => setShowAll(true)}
            className="text-sm font-medium text-gray-700 underline hover:text-gray-900"
          >
            See all {reviews.length} reviews
          </button>
        </div>
      )}
    </div>
  );
};

export default PartnerReviews;
