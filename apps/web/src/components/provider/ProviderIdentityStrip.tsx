"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Star, Home, Building2, MapPin, Trophy } from "lucide-react";

export interface ProviderProfileSummary {
  supports_house_calls: boolean;
  supports_salon: boolean;
  max_service_distance_km: number | null;
  is_distance_filter_enabled?: boolean;
}

interface ProviderIdentityStripProps {
  /** Average rating (e.g. 4.8) */
  averageRating: number;
  /** Total review count */
  totalReviews: number;
  /** Current badge name, if any */
  badgeName: string | null;
  /** Badge color for pill (hex or Tailwind) */
  badgeColor?: string | null;
  /** What service types the provider offers */
  profile: ProviderProfileSummary;
}

export function ProviderIdentityStrip({
  averageRating,
  totalReviews,
  badgeName,
  badgeColor,
  profile,
}: ProviderIdentityStripProps) {
  const router = useRouter();
  const {
    supports_house_calls,
    supports_salon,
    max_service_distance_km,
    is_distance_filter_enabled,
  } = profile;

  const serviceTypes: string[] = [];
  if (supports_house_calls) serviceTypes.push("At-home");
  if (supports_salon) serviceTypes.push("At-salon");
  const serviceTypeLabel = serviceTypes.length ? serviceTypes.join(" · ") : "—";

  return (
    <div
      className="mb-4 sm:mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
      role="region"
      aria-label="Your profile at a glance"
    >
      {/* Rating — Uber-style, clickable to reviews */}
      <button
        type="button"
        onClick={() => router.push("/provider/reviews")}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label={`Rating: ${averageRating.toFixed(1)} from ${totalReviews} reviews. View reviews.`}
      >
        <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden />
        <span className="text-lg font-bold text-gray-900">
          {averageRating > 0 ? averageRating.toFixed(1) : "0.0"}
        </span>
        <span className="text-sm text-gray-500">
          ({totalReviews} {totalReviews === 1 ? "review" : "reviews"})
        </span>
      </button>

      <span className="h-4 w-px bg-gray-200" aria-hidden />

      {/* Badge level */}
      <button
        type="button"
        onClick={() => router.push("/provider/gamification")}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label={badgeName ? `Current level: ${badgeName}. View rewards.` : "View rewards and level."}
      >
        <Trophy className="h-5 w-5 text-amber-600" aria-hidden />
        <span
          className="rounded-full px-2 py-0.5 text-sm font-medium text-white"
          style={{
            backgroundColor: badgeColor && /^#|[a-z]/.test(badgeColor) ? badgeColor : "#6366f1",
          }}
        >
          {badgeName || "Getting started"}
        </span>
      </button>

      <span className="h-4 w-px bg-gray-200" aria-hidden />

      {/* Service type: At-home · At-salon */}
      <div className="flex items-center gap-1.5 px-2 py-1.5" aria-label={`You offer: ${serviceTypeLabel}`}>
        {supports_house_calls && (
          <span className="flex items-center gap-1 rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
            <Home className="h-3.5 w-3.5" /> At-home
          </span>
        )}
        {supports_salon && (
          <span className="flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-800">
            <Building2 className="h-3.5 w-3.5" /> At-salon
          </span>
        )}
        {!supports_house_calls && !supports_salon && (
          <span className="text-sm text-gray-500">No service types set</span>
        )}
      </div>

      {/* At-home radius when relevant — click to change in Distance Settings */}
      {supports_house_calls &&
        is_distance_filter_enabled === true &&
        max_service_distance_km != null &&
        max_service_distance_km > 0 && (
        <>
          <span className="h-4 w-px bg-gray-200" aria-hidden />
          <button
            type="button"
            onClick={() => router.push("/provider/settings/distance")}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label={`You accept at-home bookings within ${max_service_distance_km} km. Open distance settings to change.`}
          >
            <MapPin className="h-4 w-4 text-indigo-600" aria-hidden />
            <span className="text-sm font-medium text-gray-700">
              Within <strong>{max_service_distance_km} km</strong>
            </span>
          </button>
        </>
      )}
    </div>
  );
}
