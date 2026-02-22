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
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1">
            <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
            <span className="text-2xl font-semibold">{overallRating.toFixed(1)}</span>
          </div>
          <span className="text-gray-500">
            rating with {voteCount.toLocaleString()} {voteCount === 1 ? "review" : "reviews"}
          </span>
        </div>
        <p className="text-3xl font-semibold mb-1">
          {overallRating.toFixed(1)} ({voteCount.toLocaleString()})
        </p>
      </div>

      <div className="space-y-6">
            {displayedReviews.map((review) => (
              <div key={review.id} className="border-b border-gray-200 pb-6 last:border-0">
                <div className="flex items-start gap-3 mb-2">
                  <div className="relative w-10 h-10 flex-shrink-0">
                    {review.avatar_url ? (
                      <Image
                        src={review.avatar_url}
                        alt={review.reviewerName}
                        width={40}
                        height={40}
                        className="rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                        {review.reviewerInitial}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{review.reviewerName}</p>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < review.rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mb-2">{review.date}</p>
                    <p className="text-gray-700">{review.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!showAll && reviews.length > 6 && (
            <div className="mt-6">
              <button
                onClick={() => setShowAll(true)}
                className="text-gray-600 hover:text-gray-900 underline text-sm"
              >
                See all {reviews.length} reviews
              </button>
            </div>
          )}
    </div>
  );
};

export default PartnerReviews;
