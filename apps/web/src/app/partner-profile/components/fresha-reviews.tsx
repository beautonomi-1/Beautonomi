"use client";
import React, { useState } from "react";
import Image, { type StaticImageData } from "next/image";
import { Star } from "lucide-react";
import UserImage from "./../../../../public/images/8aa5cbca-b607-4a45-bd0c-2d63a663aa30.webp";

type ImgSrc = StaticImageData | string;

type Review = {
  id: number;
  reviewerName: string;
  reviewerInitial: string;
  date: string;
  rating: number;
  text: string;
  avatar?: ImgSrc;
};

const reviews: Review[] = [
  {
    id: 1,
    reviewerName: "Annika v",
    reviewerInitial: "A",
    date: "Sun, Jan 18, 2026 at 4:25 PM",
    rating: 5,
    text: "I appreciate Q's attention to detail so much!!",
    avatar: UserImage,
  },
  {
    id: 2,
    reviewerName: "Petreaux B",
    reviewerInitial: "P",
    date: "Sat, Jan 17, 2026 at 9:23 AM",
    rating: 5,
    text: "Professional yet friendly environment and staff. Quaqamba takes care of my bio sculpture routine and...",
    avatar: UserImage,
  },
  {
    id: 3,
    reviewerName: "Zayn C",
    reviewerInitial: "Z",
    date: "Thu, Jan 15, 2026 at 5:59 PM",
    rating: 5,
    text: "An amazing experience, thank you",
    avatar: UserImage,
  },
  {
    id: 4,
    reviewerName: "Carla P",
    reviewerInitial: "C",
    date: "Wed, Jan 14, 2026 at 8:06 PM",
    rating: 5,
    text: "Awesome! I got a fabulous pedicure and the colour is amazing, great service too. Will be back!",
    avatar: UserImage,
  },
  {
    id: 5,
    reviewerName: "Andy S",
    reviewerInitial: "A",
    date: "Wed, Jan 14, 2026 at 9:15 AM",
    rating: 5,
    text: "Fabulous",
    avatar: UserImage,
  },
  {
    id: 6,
    reviewerName: "Sanne K",
    reviewerInitial: "S",
    date: "Tue, Jan 13, 2026 at 12:16 PM",
    rating: 5,
    text: "My nails look amazing, and the foot massage was amazing - almost fell asleep!",
    avatar: UserImage,
  },
];

interface PartnerReviewsProps {
  overallRating?: number;
  voteCount?: number;
}

const PartnerReviews: React.FC<PartnerReviewsProps> = ({
  overallRating = 4.9,
  voteCount = 4471,
}) => {
  const [showAll, setShowAll] = useState(false);
  const displayedReviews = showAll ? reviews : reviews.slice(0, 6);

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1">
            <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
            <span className="text-2xl font-semibold">{overallRating}</span>
          </div>
          <span className="text-gray-500">
            rating with {voteCount.toLocaleString()} votes
          </span>
        </div>
        <p className="text-3xl font-semibold mb-1">
          {overallRating}({voteCount.toLocaleString()})
        </p>
      </div>

      <div className="space-y-6">
        {displayedReviews.map((review) => (
          <div key={review.id} className="border-b border-gray-200 pb-6 last:border-0">
            <div className="flex items-start gap-3 mb-2">
              <div className="relative w-10 h-10 flex-shrink-0">
                {review.avatar ? (
                  <Image
                    src={review.avatar}
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
                {review.text.length > 100 && (
                  <button className="text-sm text-gray-600 hover:text-gray-900 mt-1">
                    Read more
                  </button>
                )}
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
            See all
          </button>
        </div>
      )}
    </div>
  );
};

export default PartnerReviews;
