"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Trophy, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RewardsCardProps {
  gamification: {
    total_points: number;
    current_badge: {
      id: string;
      name: string;
      color: string;
    } | null;
    badge_earned_at?: string | null;
    progress_to_next_badge: {
      badge: {
        id: string;
        name: string;
        color: string;
      };
      current_points: number;
      required_points: number;
      points_needed: number;
      progress_percentage: number;
    } | null;
  };
}

export function RewardsCard({ gamification }: RewardsCardProps) {
  const router = useRouter();
  
  // Determine what to show - current badge or next badge progress
  const currentBadge = gamification.current_badge;
  const nextBadgeProgress = gamification.progress_to_next_badge;
  
  // If no badge yet, show progress to first badge
  // If has badge, show progress to next badge
  const displayBadge = currentBadge || nextBadgeProgress?.badge;
  const showProgress = nextBadgeProgress;
  const showGetStarted = !displayBadge && !showProgress;

  return (
    <div className="mb-4 sm:mb-6">
      <div 
        className="relative overflow-hidden rounded-2xl shadow-lg bg-white border border-gray-200"
      >
        <div className="relative p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900">Rewards & Achievements</h3>
                {currentBadge ? (
                  <>
                    <p className="text-sm sm:text-base text-gray-600 mt-0.5">Current: {currentBadge.name}</p>
                    {gamification.badge_earned_at && (() => {
                      const earnedAt = new Date(gamification.badge_earned_at).getTime();
                      const daysSince = (Date.now() - earnedAt) / (24 * 60 * 60 * 1000);
                      if (daysSince <= 14) {
                        return (
                          <p className="text-xs sm:text-sm text-amber-600 mt-0.5 font-medium">
                            🎉 Congratulations on earning this badge!
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </>
                ) : showGetStarted ? (
                  <p className="text-sm sm:text-base text-gray-600 mt-0.5">Earn points and unlock badges</p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Max tier — has badge, no next level */}
          {currentBadge && !showProgress && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 mb-4">
              <p className="text-sm font-bold text-gray-900">Top tier unlocked</p>
              <p className="text-xs sm:text-sm text-gray-600 mt-1 leading-relaxed">
                You&apos;re at the highest badge level. Keep delivering great service to stay featured.
              </p>
            </div>
          )}

          {/* Progress Section */}
          {showProgress && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm sm:text-base font-medium text-gray-700">
                    Level up next
                  </p>
                  <span className="text-xs sm:text-sm text-gray-600 font-semibold">
                    {showProgress.progress_percentage}%
                  </span>
                </div>
                <h4 className="text-lg sm:text-xl font-bold mb-4 text-gray-900">{showProgress.badge.name}</h4>
                
                {/* Points Display with Star */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
                      {showProgress.current_points.toLocaleString()}
                      <Star className="w-5 h-5 sm:w-6 sm:h-6 text-primary fill-primary" />
                    </span>
                    <span className="text-base sm:text-lg text-gray-600">
                      / {showProgress.required_points.toLocaleString()} points
                    </span>
                  </div>
                  
                  {/* Roadmap Progress */}
                  <div className="relative mt-4">
                    {/* Roadmap Track */}
                    <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                      {/* Progress Fill */}
                      <div 
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-primary-hover rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${showProgress.progress_percentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Points Needed */}
                {showProgress.points_needed > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm sm:text-base text-gray-700">
                      <span className="font-semibold text-primary">{showProgress.points_needed.toLocaleString()}</span> more points needed
                    </p>
                    <p className="text-sm font-medium text-gray-800">
                      You’re {showProgress.points_needed.toLocaleString()} points away from {showProgress.badge.name}.
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 italic">
                      💡 Keep earning points by completing bookings and receiving great reviews!
                    </p>
                  </div>
                ) : (
                  <p className="text-sm sm:text-base text-primary font-semibold">
                    🎉 You've reached the requirements!
                  </p>
                )}
              </div>
            </div>
          )}

          {/* No Progress (First Badge) or Get Started when no data yet */}
          {(!showProgress && !currentBadge && displayBadge) || showGetStarted ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-lg sm:text-xl font-bold mb-2 text-gray-900">
                  {showGetStarted ? "Start earning" : "Get Started"}
                </h4>
                <p className="text-sm sm:text-base text-gray-700 mb-4">
                  {showGetStarted ? (
                    <>Complete bookings and get great reviews to earn points and unlock badges. Higher tiers unlock perks like featured placement and more.</>
                  ) : (
                    <>Start earning points to unlock your first badge: <span className="font-semibold text-primary">{displayBadge.name}</span></>
                  )}
                </p>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
                    {(gamification.total_points ?? 0).toLocaleString()}
                    <Star className="w-5 h-5 sm:w-6 sm:h-6 text-primary fill-primary" />
                  </span>
                  <span className="text-base sm:text-lg text-gray-600">points earned</span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 italic">
                  💡 Complete bookings and receive great reviews to earn more points!
                </p>
              </div>
            </div>
          ) : null}

          {/* Details Button */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <Button
              onClick={() => router.push("/provider/gamification")}
              variant="outline"
              className="w-full sm:w-auto border-primary text-primary hover:bg-primary hover:text-white transition-colors"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              View badges & journey
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
