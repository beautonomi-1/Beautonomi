import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import * as Haptics from "expo-haptics";
import { Redirect } from "expo-router";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useGamificationAutoHeal } from "@/hooks/useGamificationAutoHeal";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors, Shadows } from "@/constants/colors";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

interface Milestone {
  id: string;
  milestone_type: string;
  achieved_at: string;
  metadata?: Record<string, unknown> | null;
}

interface BadgeBenefits {
  free_subscription?: boolean;
  featured?: boolean;
}

interface BadgeRequirements {
  points?: number;
  min_rating?: number;
  min_reviews?: number;
  min_bookings?: number;
}

interface ProgressToNext {
  badge: {
    name: string;
    tier: number;
    description?: string | null;
    color?: string | null;
    requirements?: BadgeRequirements;
  };
  current_points: number;
  required_points: number;
  points_needed: number;
  progress_percentage: number;
}

interface LadderBadge {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  tier: number;
  color?: string | null;
  icon_url?: string | null;
  requirements?: BadgeRequirements;
  benefits?: BadgeBenefits;
  status: "current" | "earned" | "next" | "locked";
  points_required: number;
}

interface GamificationResponse {
  points?: { total: number; lifetime: number; current_tier: number };
  current_badge?: {
    id: string;
    name: string;
    description?: string | null;
    tier: number;
    color?: string | null;
    icon_url?: string | null;
    earned_at?: string | null;
    expires_at?: string | null;
    benefits?: BadgeBenefits;
    requirements?: BadgeRequirements;
  } | null;
  badge_ladder?: LadderBadge[];
  milestones?: Milestone[];
  progress_to_next_badge?: ProgressToNext | null;
  provider_stats?: { total_bookings: number; review_count: number; rating_average?: number };
}

const EARN_TIPS: { icon: IoniconName; titleKey: string; bodyKey: string }[] = [
  {
    icon: "calendar-outline",
    titleKey: "earnTipBookingsTitle",
    bodyKey: "earnTipBookingsBody",
  },
  {
    icon: "star-outline",
    titleKey: "earnTipReviewsTitle",
    bodyKey: "earnTipReviewsBody",
  },
  {
    icon: "trending-up-outline",
    titleKey: "earnTipConsistentTitle",
    bodyKey: "earnTipConsistentBody",
  },
];

const MILESTONE_META: Record<string, { labelKey: string; icon: IoniconName }> = {
  first_booking: { labelKey: "milestoneFirstBooking", icon: "calendar" },
  "10_bookings": { labelKey: "milestone10Bookings", icon: "calendar" },
  ten_bookings: { labelKey: "milestone10Bookings", icon: "calendar" },
  "50_bookings": { labelKey: "milestone50Bookings", icon: "calendar" },
  fifty_bookings: { labelKey: "milestone50Bookings", icon: "calendar" },
  "100_bookings": { labelKey: "milestone100Bookings", icon: "calendar" },
  hundred_bookings: { labelKey: "milestone100Bookings", icon: "calendar" },
  "500_bookings": { labelKey: "milestone500Bookings", icon: "calendar" },
  five_hundred_bookings: { labelKey: "milestone500Bookings", icon: "calendar" },
  "1000_bookings": { labelKey: "milestone1000Bookings", icon: "calendar" },
  thousand_bookings: { labelKey: "milestone1000Bookings", icon: "calendar" },
  "100_reviews": { labelKey: "milestone100Reviews", icon: "chatbubbles" },
  "10_reviews": { labelKey: "milestone10Reviews", icon: "chatbubbles" },
  ten_reviews: { labelKey: "milestone10Reviews", icon: "chatbubbles" },
  "50_reviews": { labelKey: "milestone50Reviews", icon: "chatbubbles" },
  fifty_reviews: { labelKey: "milestone50Reviews", icon: "chatbubbles" },
  first_review: { labelKey: "milestoneFirstReview", icon: "chatbubble" },
  perfect_rating: { labelKey: "milestonePerfectRating", icon: "star" },
  perfect_rating_month: { labelKey: "milestonePerfectRatingMonth", icon: "star" },
};

function useGm() {
  const { t } = useTranslation();
  return useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.gamification.${key}`, opts) as string,
    [t],
  );
}

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function badgeTint(color: string | null | undefined, alpha = "22"): string {
  if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) return `${color}${alpha}`;
  return Colors.primaryLight;
}

function milestoneLabel(
  type: string,
  gm: (key: string, opts?: Record<string, unknown>) => string,
): { label: string; icon: IoniconName } {
  const known = MILESTONE_META[type];
  if (known) return { label: gm(known.labelKey), icon: known.icon };
  const label = type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, icon: "flag" };
}

function formatRequirementHint(
  req: BadgeRequirements | undefined,
  gm: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  if (!req) return null;
  const parts: string[] = [];
  if (req.points) parts.push(gm("reqPoints", { amount: req.points.toLocaleString() }));
  if (req.min_reviews) parts.push(gm("reqReviews", { count: req.min_reviews }));
  if (req.min_bookings) parts.push(gm("reqBookings", { count: req.min_bookings }));
  if (req.min_rating) parts.push(gm("reqRating", { rating: req.min_rating }));
  return parts.length ? parts.join(" · ") : null;
}

function BenefitChips({ benefits }: { benefits?: BadgeBenefits }) {
  const gm = useGm();
  if (!benefits?.featured && !benefits?.free_subscription) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      {benefits.featured ? (
        <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 999, backgroundColor: "#dbeafe", paddingHorizontal: 10, paddingVertical: 4 }}>
          <Ionicons name="sparkles" size={12} color="#1d4ed8" />
          <Text style={{ marginStart: 4, fontSize: 11, fontWeight: "600", color: "#1e40af" }}>{gm("featuredListing")}</Text>
        </View>
      ) : null}
      {benefits.free_subscription ? (
        <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 999, backgroundColor: "#dcfce7", paddingHorizontal: 10, paddingVertical: 4 }}>
          <Ionicons name="gift-outline" size={12} color="#15803d" />
          <Text style={{ marginStart: 4, fontSize: 11, fontWeight: "600", color: "#166534" }}>{gm("subscriptionPerk")}</Text>
        </View>
      ) : null}
    </View>
  );
}

function CurrentBadgeHero({
  badge,
  pointsTotal,
}: {
  badge: NonNullable<GamificationResponse["current_badge"]>;
  pointsTotal: number;
}) {
  const gm = useGm();
  const accent = badge.color && /^#/.test(badge.color) ? badge.color : Colors.primary;
  return (
    <View
      style={{
        marginBottom: 20,
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: badgeTint(accent, "44"),
        backgroundColor: Colors.white,
        ...Shadows.card,
      }}
    >
      <View style={{ padding: 20, backgroundColor: badgeTint(accent, "18") }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", color: Colors.gray[600] }}>
          {gm("yourLevel")}
        </Text>
        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              height: 72,
              width: 72,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 36,
              backgroundColor: accent,
              ...Shadows.cardSmall,
            }}
          >
            {badge.icon_url ? (
              <Image source={{ uri: badge.icon_url }} style={{ width: 56, height: 56 }} contentFit="contain" accessibilityIgnoresInvertColors />
            ) : (
              <Ionicons name="trophy" size={36} color={Colors.white} />
            )}
          </View>
          <View style={{ marginStart: 16, flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: Colors.gray[900] }} numberOfLines={2}>
              {badge.name}
            </Text>
            {badge.description ? (
              <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: Colors.gray[600] }} numberOfLines={3}>
                {badge.description}
              </Text>
            ) : null}
            <BenefitChips benefits={badge.benefits} />
          </View>
        </View>
        <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <View style={{ borderRadius: 12, backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 8, minWidth: 100 }}>
            <Text style={{ fontSize: 11, color: Colors.gray[500] }}>{gm("points")}</Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{pointsTotal.toLocaleString()}</Text>
          </View>
          {badge.earned_at ? (
            <View style={{ borderRadius: 12, backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 8, flex: 1, minWidth: 120 }}>
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>{gm("earned")}</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[800] }}>{formatDateSafe(badge.earned_at)}</Text>
            </View>
          ) : null}
          {badge.expires_at ? (
            <View style={{ borderRadius: 12, backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 8, flex: 1, minWidth: 120 }}>
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>{gm("activeUntil")}</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[800] }}>{formatDateSafe(badge.expires_at)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ProgressToNextCard({ progress }: { progress: ProgressToNext }) {
  const gm = useGm();
  const accent = progress.badge.color && /^#/.test(progress.badge.color) ? progress.badge.color : Colors.primary;
  const pct = Math.min(100, progress.progress_percentage);
  const almostThere = pct >= 75 && progress.points_needed > 0;

  return (
    <View
      style={{
        marginBottom: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.gray[200],
        backgroundColor: Colors.white,
        padding: 16,
        ...Shadows.cardSmall,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.gray[900] }}>{gm("levelUpNext")}</Text>
        <View style={{ borderRadius: 999, backgroundColor: badgeTint(accent), paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: accent }}>{pct}%</Text>
        </View>
      </View>
      <Text style={{ marginTop: 4, fontSize: 16, fontWeight: "600", color: accent }}>{progress.badge.name}</Text>
      {progress.badge.description ? (
        <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 18, color: Colors.gray[600] }}>{progress.badge.description}</Text>
      ) : null}
      <View style={{ marginTop: 14, flexDirection: "row", alignItems: "baseline" }}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.gray[900] }}>{progress.current_points.toLocaleString()}</Text>
        <Text style={{ marginStart: 6, fontSize: 15, color: Colors.gray[500] }}>
          {gm("ptsRatio", { amount: progress.required_points.toLocaleString() })}
        </Text>
      </View>
      <View style={{ marginTop: 10, height: 10, overflow: "hidden", borderRadius: 999, backgroundColor: Colors.gray[100] }}>
        <View
          style={{
            height: "100%",
            borderRadius: 999,
            backgroundColor: accent,
            width: `${pct}%`,
          }}
        />
      </View>
      {progress.points_needed > 0 ? (
        <Text style={{ marginTop: 10, fontSize: 14, color: Colors.gray[700] }}>
          {almostThere
            ? gm("pointsToUnlockAlmost", { amount: progress.points_needed.toLocaleString() })
            : gm("pointsToUnlockKeepGoing", { amount: progress.points_needed.toLocaleString() })}
        </Text>
      ) : (
        <Text style={{ marginTop: 10, fontSize: 14, fontWeight: "600", color: Colors.success }}>
          {gm("hitThreshold")}
        </Text>
      )}
    </View>
  );
}

function BadgeLadderSection({ ladder }: { ladder: LadderBadge[] }) {
  const gm = useGm();
  if (ladder.length === 0) return null;

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ marginBottom: 4, fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{gm("badgeJourney")}</Text>
      <Text style={{ marginBottom: 12, fontSize: 13, color: Colors.gray[500] }}>
        {gm("badgeJourneyDesc")}
      </Text>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, overflow: "hidden" }}>
        {ladder.map((item, idx) => {
          const accent = item.color && /^#/.test(item.color) ? item.color : Colors.primary;
          const isLast = idx === ladder.length - 1;
          const hint = formatRequirementHint(item.requirements, gm);
          const statusLabel =
            item.status === "current"
              ? gm("statusCurrent")
              : item.status === "earned"
                ? gm("statusEarned")
                : item.status === "next"
                  ? gm("statusNext")
                  : gm("statusLocked");
          const statusColor =
            item.status === "current"
              ? accent
              : item.status === "earned"
                ? Colors.success
                : item.status === "next"
                  ? Colors.primary
                  : Colors.gray[400];
          const rowBg =
            item.status === "current"
              ? badgeTint(accent, "12")
              : item.status === "next"
                ? Colors.primaryLight
                : Colors.white;

          return (
            <View
              key={item.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: rowBg,
                borderBottomWidth: isLast ? 0 : 1,
                borderBottomColor: Colors.gray[100],
                opacity: item.status === "locked" ? 0.72 : 1,
              }}
            >
              <View
                style={{
                  height: 44,
                  width: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  backgroundColor: item.status === "locked" ? Colors.gray[100] : badgeTint(accent, "33"),
                  borderWidth: item.status === "current" ? 2 : 0,
                  borderColor: accent,
                }}
              >
                {item.status === "earned" ? (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
                ) : item.icon_url && item.status !== "locked" ? (
                  <Image source={{ uri: item.icon_url }} style={{ width: 32, height: 32 }} contentFit="contain" accessibilityIgnoresInvertColors />
                ) : (
                  <Ionicons
                    name={item.status === "locked" ? "lock-closed-outline" : "ribbon-outline"}
                    size={22}
                    color={item.status === "locked" ? Colors.gray[400] : accent}
                  />
                )}
              </View>
              <View style={{ marginStart: 12, flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={{ borderRadius: 999, backgroundColor: `${statusColor}18`, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: statusColor }}>{statusLabel}</Text>
                  </View>
                </View>
                {hint ? (
                  <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }} numberOfLines={2}>
                    {hint}
                  </Text>
                ) : null}
                {item.status === "next" && item.benefits ? (
                  <BenefitChips benefits={item.benefits} />
                ) : null}
              </View>
              {item.status !== "locked" ? (
                <Ionicons
                  name={item.status === "current" ? "star" : item.status === "earned" ? "checkmark" : "arrow-forward-circle"}
                  size={22}
                  color={statusColor}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function HowToEarnSection() {
  const gm = useGm();
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ marginBottom: 12, fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{gm("howToLevelUp")}</Text>
      {EARN_TIPS.map((tip) => (
        <View
          key={tip.titleKey}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            marginBottom: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.white,
            padding: 14,
          }}
        >
          <View style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: Colors.primaryLight }}>
            <Ionicons name={tip.icon} size={20} color={Colors.primary} />
          </View>
          <View style={{ marginStart: 12, flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{gm(tip.titleKey)}</Text>
            <Text style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: Colors.gray[600] }}>{gm(tip.bodyKey)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyBadgeHero({ progress }: { progress: ProgressToNext | null }) {
  const gm = useGm();
  const nextName = progress?.badge.name ?? gm("firstBadgeFallback");
  return (
    <View
      style={{
        marginBottom: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.primaryRing,
        backgroundColor: Colors.primaryLight,
        padding: 24,
        alignItems: "center",
      }}
    >
      <View
        style={{
          height: 80,
          width: 80,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 40,
          backgroundColor: Colors.white,
          marginBottom: 16,
          ...Shadows.cardSmall,
        }}
      >
        <Ionicons name="trophy-outline" size={40} color={Colors.primary} />
      </View>
      <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.gray[900], textAlign: "center" }}>
        {gm("emptyHeroTitle")}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 21, color: Colors.gray[600], textAlign: "center" }}>
        {gm("emptyHeroBody", { name: nextName })}
      </Text>
    </View>
  );
}

/** Content-only for use in Rewards hub (Badges tab). */
export function GamificationBadgesContent() {
  const gm = useGm();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<GamificationResponse>(
    "/api/provider/gamification"
  );
  useGamificationAutoHeal(data, refresh);
  const { execute: recalculate, loading: recalculating } = useApiMutation("post");
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);
  const handleRecalculate = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await recalculate("/api/provider/gamification", {});
    if (err) {
      Alert.alert(gm("couldNotRecalculate"), err);
      return;
    }
    await refresh();
  }, [recalculate, refresh, gm]);

  const points = data?.points ?? { total: 0, lifetime: 0, current_tier: 0 };
  const badge = data?.current_badge ?? null;
  const milestones = data?.milestones ?? [];
  const progress = data?.progress_to_next_badge ?? null;
  const ladder = data?.badge_ladder ?? [];
  const stats = data?.provider_stats;

  if (loading && !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {badge ? <CurrentBadgeHero badge={badge} pointsTotal={points.total} /> : <EmptyBadgeHero progress={progress} />}

      {!badge && points.total > 0 ? (
        <View style={{ marginBottom: 16, flexDirection: "row", borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
          <Ionicons name="flash" size={18} color={Colors.primary} style={{ marginEnd: 8 }} />
          <Text style={{ flex: 1, fontSize: 13, color: Colors.gray[700] }}>
            {gm("alreadyHavePoints", { amount: points.total.toLocaleString(), name: progress?.badge.name ?? gm("firstBadgeFallback") })}
          </Text>
        </View>
      ) : null}

      {progress ? <ProgressToNextCard progress={progress} /> : null}

      {badge && !progress ? (
        <View
          style={{
            marginBottom: 20,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#fde68a",
            backgroundColor: "#fffbeb",
            padding: 16,
            flexDirection: "row",
            alignItems: "flex-start",
          }}
        >
          <Ionicons name="star" size={22} color="#b45309" style={{ marginEnd: 12, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.gray[900] }}>{gm("topTierTitle")}</Text>
            <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 19, color: Colors.gray[600] }}>
              {gm("topTierBody")}
            </Text>
          </View>
        </View>
      ) : null}

      {stats &&
      (stats.total_bookings > 0 || stats.review_count > 0 || (stats.rating_average ?? 0) > 0) ? (
        <View
          style={{
            marginBottom: 20,
            flexDirection: "row",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.white,
            padding: 14,
          }}
        >
          {stats.total_bookings > 0 ? (
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.gray[900] }}>{stats.total_bookings}</Text>
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>{gm("bookings")}</Text>
            </View>
          ) : null}
          {stats.review_count > 0 ? (
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.gray[900] }}>{stats.review_count}</Text>
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>{gm("reviews")}</Text>
            </View>
          ) : null}
          {(stats.rating_average ?? 0) > 0 ? (
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.gray[900] }}>{stats.rating_average!.toFixed(1)}</Text>
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>{gm("rating")}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <BadgeLadderSection ladder={ladder} />
      <HowToEarnSection />

      {milestones.length > 0 ? (
        <View style={{ marginBottom: 24 }}>
          <Text style={{ marginBottom: 4, fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{gm("milestones")}</Text>
          <Text style={{ marginBottom: 12, fontSize: 13, color: Colors.gray[500] }}>
            {gm("achievementsUnlocked", { count: milestones.length })}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 }}>
            {milestones.slice(0, 12).map((m) => {
              const meta = milestoneLabel(m.milestone_type, gm);
              return (
                <View
                  key={m.id}
                  style={{
                    width: "50%",
                    paddingHorizontal: 6,
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: Colors.gray[200],
                      backgroundColor: Colors.white,
                      padding: 12,
                      minHeight: 96,
                    }}
                  >
                    <View
                      style={{
                        height: 36,
                        width: 36,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 18,
                        backgroundColor: Colors.primaryLight,
                        marginBottom: 8,
                      }}
                    >
                      <Ionicons name={meta.icon} size={18} color={Colors.primary} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={2}>
                      {meta.label}
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: 11, color: Colors.gray[500] }}>{formatDateSafe(m.achieved_at)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <ActionButton
        label={recalculating ? gm("syncing") : gm("syncBadgeProgress")}
        onPress={handleRecalculate}
        loading={recalculating}
        variant="outline"
        fullWidth
        icon="refresh-outline"
      />
      <Text style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: Colors.gray[400] }}>
        {gm("syncHint")}
      </Text>
    </ScrollView>
  );
}

/** Legacy route: opens Rewards hub on the Badges tab. */
export default function GamificationScreen() {
  return <Redirect href="/(app)/(tabs)/more/rewards-hub?tab=badges" />;
}
