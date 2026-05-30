"use client";

import Image from "next/image";
import {
  Trophy,
  Star,
  Award,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
  Clock,
  Gift,
  Zap,
  Calendar,
  Lock,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  type BadgeBenefits,
  type BadgeRequirements,
  type LadderBadge,
  EARN_TIPS,
  badgeAccentColor,
  formatGamificationDate,
  formatMilestoneLabel,
  formatPointSource,
  formatRequirementHint,
  ladderStatusLabel,
} from "@/lib/provider/gamification-display";

export interface ProviderGamificationData {
  points: {
    total: number;
    lifetime: number;
    current_tier: number;
    last_calculated: string | null;
  };
  current_badge: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    icon_url: string | null;
    tier: number;
    color: string;
    requirements: BadgeRequirements;
    benefits: BadgeBenefits;
    earned_at: string | null;
    expires_at: string | null;
  } | null;
  badge_ladder?: LadderBadge[];
  milestones: Array<{
    id: string;
    milestone_type: string;
    achieved_at: string;
    metadata: Record<string, unknown>;
  }>;
  transactions: Array<{
    id: string;
    points: number;
    source: string;
    source_id: string | null;
    description: string | null;
    created_at: string;
  }>;
  progress_to_next_badge: {
    badge: {
      id: string;
      name: string;
      tier: number;
      color: string;
      description?: string | null;
      requirements?: BadgeRequirements;
    };
    current_points: number;
    required_points: number;
    points_needed: number;
    progress_percentage: number;
  } | null;
  provider_stats: {
    total_bookings: number;
    review_count: number;
    rating_average: number;
    total_earnings: number;
  };
}

function BenefitChips({ benefits }: { benefits?: BadgeBenefits }) {
  if (!benefits?.featured && !benefits?.free_subscription) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {benefits.featured ? (
        <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">
          <Sparkles className="w-3 h-3 mr-1" />
          Featured listing
        </Badge>
      ) : null}
      {benefits.free_subscription ? (
        <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
          <Gift className="w-3 h-3 mr-1" />
          Subscription perk
        </Badge>
      ) : null}
    </div>
  );
}

function CurrentBadgeHero({
  badge,
  pointsTotal,
}: {
  badge: NonNullable<ProviderGamificationData["current_badge"]>;
  pointsTotal: number;
}) {
  const accent = badgeAccentColor(badge.color);
  return (
    <Card className="overflow-hidden border-0 shadow-md md:col-span-2">
      <div className="p-6 sm:p-8" style={{ backgroundColor: `${accent}14` }}>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">Your level</p>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-5">
          <div
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-white shadow-lg shrink-0 mx-auto sm:mx-0"
            style={{ backgroundColor: accent }}
          >
            {badge.icon_url ? (
              <Image
                src={badge.icon_url}
                alt=""
                width={80}
                height={80}
                className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
                unoptimized
              />
            ) : (
              <Trophy className="w-10 h-10 sm:w-12 sm:h-12" />
            )}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">{badge.name}</h2>
            {badge.description ? (
              <p className="mt-2 text-sm sm:text-base text-gray-600 leading-relaxed">{badge.description}</p>
            ) : null}
            <BenefitChips benefits={badge.benefits} />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <div className="rounded-xl bg-white/90 px-4 py-3 min-w-[120px] shadow-sm">
            <p className="text-xs text-gray-500">Points</p>
            <p className="text-xl font-bold text-gray-900">{pointsTotal.toLocaleString()}</p>
          </div>
          {badge.earned_at ? (
            <div className="rounded-xl bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-xs text-gray-500">Earned</p>
              <p className="text-sm font-semibold text-gray-800">{formatGamificationDate(badge.earned_at)}</p>
            </div>
          ) : null}
          {badge.expires_at ? (
            <div className="rounded-xl bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-xs text-gray-500">Active until</p>
              <p className="text-sm font-semibold text-gray-800">{formatGamificationDate(badge.expires_at)}</p>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function EmptyBadgeHero({
  progress,
  pointsTotal,
}: {
  progress: ProviderGamificationData["progress_to_next_badge"];
  pointsTotal: number;
}) {
  const nextName = progress?.badge.name ?? "your first badge";
  return (
    <Card className="md:col-span-2 border-primary/25 bg-gradient-to-br from-primary/5 to-primary/[0.02]">
      <CardContent className="py-10 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-md">
          <Trophy className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900">Start your badge journey</h2>
        <p className="mt-3 max-w-md mx-auto text-sm text-gray-600 leading-relaxed">
          Complete bookings and collect reviews to earn points. Your next milestone is{" "}
          <span className="font-bold text-primary">{nextName}</span>.
        </p>
        {pointsTotal > 0 ? (
          <p className="mt-4 text-sm text-gray-700">
            You already have <span className="font-bold">{pointsTotal.toLocaleString()}</span> points — keep going!
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProgressCard({ progress }: { progress: NonNullable<ProviderGamificationData["progress_to_next_badge"]> }) {
  const accent = badgeAccentColor(progress.badge.color);
  const pct = Math.min(100, progress.progress_percentage);
  const almostThere = pct >= 75 && progress.points_needed > 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5" />
            Level up next
          </CardTitle>
          <span className="text-sm font-bold rounded-full px-3 py-1" style={{ color: accent, backgroundColor: `${accent}18` }}>
            {pct}%
          </span>
        </div>
        <CardDescription className="text-base font-semibold" style={{ color: accent }}>
          {progress.badge.name}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {progress.badge.description ? (
          <p className="text-sm text-gray-600">{progress.badge.description}</p>
        ) : null}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-extrabold text-gray-900">{progress.current_points.toLocaleString()}</span>
          <span className="text-gray-500">/ {progress.required_points.toLocaleString()} pts</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: accent }}
          />
        </div>
        {progress.points_needed > 0 ? (
          <p className="text-sm text-gray-700">
            <span className="font-bold" style={{ color: accent }}>
              {progress.points_needed.toLocaleString()}
            </span>{" "}
            points to unlock — {almostThere ? "you're almost there!" : "keep the momentum going."}
          </p>
        ) : (
          <p className="text-sm font-semibold text-green-700">
            You've hit the point threshold — badge updates after the next sync.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BadgeLadderSection({ ladder }: { ladder: LadderBadge[] }) {
  if (ladder.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Badge journey</CardTitle>
        <CardDescription>Every level and what you&apos;re working toward</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-gray-100">
          {ladder.map((item) => {
            const accent = badgeAccentColor(item.color);
            const status = item.status;
            const statusText = ladderStatusLabel(status);
            const hint = formatRequirementHint(item.requirements);
            const statusColor =
              status === "current"
                ? accent
                : status === "earned"
                  ? "#16a34a"
                  : status === "next"
                    ? "#FF0077"
                    : "#9ca3af";

            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-4 px-4 sm:px-6 py-4 transition-colors",
                  status === "current" && "bg-gray-50/80",
                  status === "next" && "bg-primary/[0.04]",
                  status === "locked" && "opacity-75",
                )}
              >
                <div
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
                    status === "locked" ? "bg-gray-100" : "",
                  )}
                  style={
                    status !== "locked"
                      ? { backgroundColor: `${accent}22`, border: status === "current" ? `2px solid ${accent}` : undefined }
                      : undefined
                  }
                >
                  {status === "earned" ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  ) : status === "locked" ? (
                    <Lock className="w-5 h-5 text-gray-400" />
                  ) : item.icon_url ? (
                    <Image src={item.icon_url} alt="" width={32} height={32} className="object-contain" unoptimized />
                  ) : (
                    <Award className="w-5 h-5" style={{ color: accent }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{item.name}</span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                      style={{ color: statusColor, backgroundColor: `${statusColor}18` }}
                    >
                      {statusText}
                    </span>
                  </div>
                  {hint ? <p className="text-xs text-gray-500 mt-0.5">{hint}</p> : null}
                  {status === "next" && item.benefits ? <BenefitChips benefits={item.benefits} /> : null}
                </div>
                {status !== "locked" ? (
                  <ArrowRight className="w-5 h-5 shrink-0 hidden sm:block" style={{ color: statusColor }} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function HowToEarnSection() {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>How to level up</CardTitle>
        <CardDescription>Simple actions that move you up the ladder</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {EARN_TIPS.map((tip, i) => (
            <div key={tip.title} className="rounded-xl border border-gray-200 p-4 bg-white">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                {i === 0 ? (
                  <Calendar className="w-5 h-5 text-primary" />
                ) : i === 1 ? (
                  <Star className="w-5 h-5 text-primary" />
                ) : (
                  <TrendingUp className="w-5 h-5 text-primary" />
                )}
              </div>
              <h4 className="font-semibold text-gray-900">{tip.title}</h4>
              <p className="mt-1 text-sm text-gray-600 leading-relaxed">{tip.body}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityStats({ stats }: { stats: ProviderGamificationData["provider_stats"] }) {
  const show =
    stats.total_bookings > 0 ||
    stats.review_count > 0 ||
    stats.rating_average > 0;
  if (!show) return null;

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {stats.total_bookings > 0 ? (
        <div className="text-center rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-extrabold text-gray-900">{stats.total_bookings}</p>
          <p className="text-xs text-gray-500 mt-1">Bookings</p>
        </div>
      ) : null}
      {stats.review_count > 0 ? (
        <div className="text-center rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-extrabold text-gray-900">{stats.review_count}</p>
          <p className="text-xs text-gray-500 mt-1">Reviews</p>
        </div>
      ) : null}
      {stats.rating_average > 0 ? (
        <div className="text-center rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-extrabold text-gray-900">{stats.rating_average.toFixed(1)}</p>
          <p className="text-xs text-gray-500 mt-1">Rating</p>
        </div>
      ) : null}
    </div>
  );
}

interface ProviderGamificationContentProps {
  data: ProviderGamificationData;
  isRecalculating: boolean;
  onRecalculate: () => void;
}

export function ProviderGamificationContent({
  data,
  isRecalculating,
  onRecalculate,
}: ProviderGamificationContentProps) {
  const ladder = data.badge_ladder ?? [];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {data.current_badge ? (
          <CurrentBadgeHero badge={data.current_badge} pointsTotal={data.points.total} />
        ) : (
          <EmptyBadgeHero progress={data.progress_to_next_badge} pointsTotal={data.points.total} />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Points
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Current points</p>
              <p className="text-3xl font-extrabold text-gray-900">{data.points.total.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Lifetime</p>
              <p className="text-xl font-semibold text-gray-700">{data.points.lifetime.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">This tier</p>
              <p className="text-lg font-semibold text-primary">{data.points.current_tier.toLocaleString()}</p>
            </div>
            <Button
              onClick={onRecalculate}
              disabled={isRecalculating}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isRecalculating && "animate-spin")} />
              {isRecalculating ? "Syncing…" : "Sync badge progress"}
            </Button>
            <p className="text-xs text-gray-400 text-center">
              Refresh after recent bookings if points look out of date.
            </p>
          </CardContent>
        </Card>
      </div>

      {data.progress_to_next_badge ? <ProgressCard progress={data.progress_to_next_badge} /> : null}

      {data.current_badge && !data.progress_to_next_badge ? (
        <Card className="mb-6 border-amber-200 bg-amber-50/80">
          <CardContent className="py-5 flex gap-3 items-start">
            <Star className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-gray-900">Top tier unlocked</p>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                You&apos;re at the highest badge level. Keep delivering great service to stay featured and retain your perks.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ActivityStats stats={data.provider_stats} />
      <BadgeLadderSection ladder={ladder} />
      <HowToEarnSection />

      <Tabs defaultValue="milestones" className="mb-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="milestones">
            <Award className="w-4 h-4 mr-2" />
            Milestones ({data.milestones.length})
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <Clock className="w-4 h-4 mr-2" />
            Point history ({data.transactions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="milestones">
          <Card>
            <CardHeader>
              <CardTitle>Achievements</CardTitle>
              <CardDescription>Milestones you&apos;ve unlocked along the way</CardDescription>
            </CardHeader>
            <CardContent>
              {data.milestones.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.milestones.map((milestone) => (
                    <div
                      key={milestone.id}
                      className="border rounded-xl p-4 hover:shadow-md transition-shadow bg-white"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      </div>
                      <h4 className="font-semibold text-gray-900">{formatMilestoneLabel(milestone.milestone_type)}</h4>
                      <p className="text-xs text-gray-500 mt-1">{formatGamificationDate(milestone.achieved_at)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Award className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-600">No milestones yet — complete bookings to unlock achievements.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Point history</CardTitle>
              <CardDescription>Recent points earned from bookings and reviews</CardDescription>
            </CardHeader>
            <CardContent>
              {data.transactions.length > 0 ? (
                <div className="space-y-3">
                  {data.transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                            transaction.points > 0 ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600",
                          )}
                        >
                          <TrendingUp className={cn("w-5 h-5", transaction.points < 0 && "rotate-180")} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{formatPointSource(transaction.source)}</p>
                          {transaction.description ? (
                            <p className="text-sm text-gray-600 truncate">{transaction.description}</p>
                          ) : null}
                          <p className="text-xs text-gray-500">{formatGamificationDate(transaction.created_at)}</p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-lg font-bold shrink-0 ml-2",
                          transaction.points > 0 ? "text-green-600" : "text-red-600",
                        )}
                      >
                        {transaction.points > 0 ? "+" : ""}
                        {transaction.points}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-600">No transactions yet. Complete bookings and receive reviews to earn points.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
