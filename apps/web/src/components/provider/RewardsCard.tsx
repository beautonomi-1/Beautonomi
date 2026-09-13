"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Trophy, Sparkles, Star } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
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
  const { t } = useTranslation();
  const prefix = "web.provider.rewardsCard";
  
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
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900">{t(`${prefix}.title`)}</h3>
                {currentBadge ? (
                  <>
                    <p className="text-sm sm:text-base text-gray-600 mt-0.5">{t(`${prefix}.currentBadge`, { name: currentBadge.name })}</p>
                    {gamification.badge_earned_at && (() => {
                      const earnedAt = new Date(gamification.badge_earned_at).getTime();
                      const daysSince = (Date.now() - earnedAt) / (24 * 60 * 60 * 1000);
                      if (daysSince <= 14) {
                        return (
                          <p className="text-xs sm:text-sm text-amber-600 mt-0.5 font-medium">
                            {t(`${prefix}.congratsBadge`)}
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </>
                ) : showGetStarted ? (
                  <p className="text-sm sm:text-base text-gray-600 mt-0.5">{t(`${prefix}.earnUnlock`)}</p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Max tier — has badge, no next level */}
          {currentBadge && !showProgress && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 mb-4">
              <p className="text-sm font-bold text-gray-900">{t(`${prefix}.topTierTitle`)}</p>
              <p className="text-xs sm:text-sm text-gray-600 mt-1 leading-relaxed">
                {t(`${prefix}.topTierBody`)}
              </p>
            </div>
          )}

          {/* Progress Section */}
          {showProgress && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm sm:text-base font-medium text-gray-700">
                    {t(`${prefix}.levelUpNext`)}
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
                      {t(`${prefix}.pointsRatio`, { amount: showProgress.required_points.toLocaleString() })}
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
                      <span className="font-semibold text-primary">{showProgress.points_needed.toLocaleString()}</span> {t(`${prefix}.morePointsNeeded`)}
                    </p>
                    <p className="text-sm font-medium text-gray-800">
                      {t(`${prefix}.pointsAway`, { amount: showProgress.points_needed.toLocaleString(), name: showProgress.badge.name })}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 italic">
                      {t(`${prefix}.keepEarningHint`)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm sm:text-base text-primary font-semibold">
                    {t(`${prefix}.reachedRequirements`)}
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
                  {showGetStarted ? t(`${prefix}.startEarning`) : t(`${prefix}.getStarted`)}
                </h4>
                <p className="text-sm sm:text-base text-gray-700 mb-4">
                  {showGetStarted ? (
                    t(`${prefix}.startEarningBody`)
                  ) : (
                    <>{t(`${prefix}.unlockFirstBadge`)} <span className="font-semibold text-primary">{displayBadge.name}</span></>
                  )}
                </p>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
                    {(gamification.total_points ?? 0).toLocaleString()}
                    <Star className="w-5 h-5 sm:w-6 sm:h-6 text-primary fill-primary" />
                  </span>
                  <span className="text-base sm:text-lg text-gray-600">{t(`${prefix}.pointsEarned`)}</span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 italic">
                  {t(`${prefix}.completeBookingsHint`)}
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
              <Sparkles className="w-4 h-4 me-2" />
              {t(`${prefix}.viewBadges`)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
