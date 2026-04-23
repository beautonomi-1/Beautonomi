import { useEffect, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Share,
  RefreshControl,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Constants from "expo-constants";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/providers/NotificationsContext";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors, shadow } from "@/constants/colors";
import { APP_URL, IOS_APP_STORE_ID } from "@/config/public-env";
import { api } from "@/lib/api-client";
import { PROFILE_SUMMARY_CACHE_KEY_PREFIX } from "@/lib/cache-keys";
import { haptic } from "@/lib/haptics";
import { useTabContentPaddingBottom } from "@/hooks/useTabContentPaddingBottom";
import { useTranslation } from "@beautonomi/i18n";
import { formatMoney } from "@beautonomi/utils";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

type IconName = keyof typeof Ionicons.glyphMap;

function formatMemberSince(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

type ReferralBannerState = {
  loaded: boolean;
  enabled: boolean;
  link: string | null;
  amountFormatted: string | null;
};

export default function ProfileScreen() {
  useScreenTracking("Profile");
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const tabScrollPaddingBottom = useTabContentPaddingBottom(24);
  const contentContainerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }
    : {};
  type ChecklistItem = { id: string; label: string; completed: boolean; required?: boolean };
  const lastProfileSummarySuccessAt = useRef(0);

  const [profileData, setProfileData] = useState<{
    completion: number;
    topItems: { id: string; label: string }[];
    checklistItems: ChecklistItem[];
    loyaltyPoints: number;
    verified: boolean;
    ratingAverage: number;
    reviewCount: number;
    avatarUrl: string | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState(false);
  const hasLoadedOnce = useRef(false);

  // §Customer-audit 2026-04: hydrate from AsyncStorage cache so the profile
  // tab renders its actual completion %, loyalty points, verification badges,
  // and rating instantly on tab-open instead of flashing from 0/empty while
  // the network request resolves. Cache is rewritten on every successful
  // fetch and keyed per-user so switching accounts doesn't leak data.
  const profileCacheKey = user ? `${PROFILE_SUMMARY_CACHE_KEY_PREFIX}.${user.id}` : null;
  const [referralBanner, setReferralBanner] = useState<ReferralBannerState>({
    loaded: false,
    enabled: true,
    link: null,
    amountFormatted: null,
  });

  const fetchProfileData = useCallback(async () => {
    if (!user) return;
    setProfileLoadError(false);
    try {
      const [summaryRes, referralsRes] = await Promise.all([
        api.get<{
          completion?: number;
          topItems?: { id: string; label: string }[];
          checklistItems?: ChecklistItem[];
          loyaltyPoints?: number;
          verified?: boolean;
          ratingAverage?: number;
          reviewCount?: number;
          avatarUrl?: string | null;
        }>("/api/me/profile-summary"),
        api.get<{
          referral_link?: string;
          settings?: {
            referral_amount?: number;
            referral_currency?: string;
            is_enabled?: boolean;
          };
        }>("/api/me/referrals"),
      ]);

      if (!referralsRes.error && referralsRes.data) {
        const rd = referralsRes.data;
        const s = rd.settings;
        const enabled = s?.is_enabled !== false;
        const amt = Number(s?.referral_amount);
        const cur = (s?.referral_currency || getTenantDefaultCurrency()).trim() || getTenantDefaultCurrency();
        const amountFormatted =
          enabled && Number.isFinite(amt) && amt > 0 ? formatMoney(amt, cur) : null;
        setReferralBanner({
          loaded: true,
          enabled,
          link: rd.referral_link?.trim() || null,
          amountFormatted,
        });
      } else {
        setReferralBanner({
          loaded: true,
          enabled: true,
          link: null,
          amountFormatted: null,
        });
      }

      if (summaryRes.error || !summaryRes.data) {
        console.warn("[Profile] profile-summary error:", summaryRes.error?.message);
        if (!hasLoadedOnce.current) setProfileLoadError(true);
        return;
      }

      hasLoadedOnce.current = true;
      lastProfileSummarySuccessAt.current = Date.now();
      const d = summaryRes.data;
      const checklist = Array.isArray(d.checklistItems) ? d.checklistItems : [];
      const next = {
        completion: d.completion ?? 0,
        topItems: d.topItems ?? [],
        checklistItems: checklist as ChecklistItem[],
        loyaltyPoints: Number(d.loyaltyPoints) || 0,
        verified: d.verified ?? false,
        ratingAverage: Number(d.ratingAverage) || 0,
        reviewCount: Number(d.reviewCount) || 0,
        avatarUrl: d.avatarUrl ?? null,
      };
      setProfileData(next);
      if (profileCacheKey) {
        AsyncStorage.setItem(profileCacheKey, JSON.stringify(next)).catch(() => {});
      }
    } catch (err) {
      console.warn("[Profile] fetchProfileData error:", err);
      if (!hasLoadedOnce.current) setProfileLoadError(true);
      setReferralBanner({
        loaded: true,
        enabled: true,
        link: null,
        amountFormatted: null,
      });
    }
  }, [user, profileCacheKey]);

  useEffect(() => {
    if (!user) {
      setProfileData(null);
      lastProfileSummarySuccessAt.current = 0;
      hasLoadedOnce.current = false;
      setReferralBanner({ loaded: false, enabled: true, link: null, amountFormatted: null });
      return;
    }
    if (profileCacheKey) {
      AsyncStorage.getItem(profileCacheKey)
        .then((raw) => {
          if (!raw) return;
          try {
            const cached = JSON.parse(raw);
            if (cached && typeof cached === "object") {
              setProfileData((prev) => prev ?? cached);
            }
          } catch {}
        })
        .catch(() => {});
    }
    void fetchProfileData();
  }, [user, fetchProfileData, profileCacheKey]);

  // Stale-while-revalidate: show cached data; background refresh if tab refocused after 60s
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (lastProfileSummarySuccessAt.current === 0) return;
      if (Date.now() - lastProfileSummarySuccessAt.current < 60_000) return;
      void fetchProfileData();
    }, [user, fetchProfileData]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchProfileData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchProfileData]);

  if (!user) {
    return <LoggedOutProfile />;
  }

  const displayName =
    user.user_metadata?.full_name ||
    [user.user_metadata?.first_name, user.user_metadata?.last_name]
      .filter(Boolean)
      .join(" ") ||
    user.email?.split("@")[0] ||
    "User";

  const avatarUrl =
    profileData?.avatarUrl ??
    user.user_metadata?.avatar_url ??
    (typeof user.user_metadata?.picture === "string"
      ? user.user_metadata.picture
      : (user.user_metadata?.picture as { data?: { url?: string } } | undefined)?.data?.url) ??
    null;
  const hasAvatar = !!avatarUrl;
  const emailVerified = !!user.email_confirmed_at;
  const phoneVerified = !!user.phone_confirmed_at;
  const isVerified = profileData?.verified ?? false;
  const completionPct = profileData?.completion ?? 0;
  const checklistItems = profileData?.checklistItems ?? [];
  const hasIncompleteChecklist =
    (checklistItems.length > 0 && checklistItems.some((item) => !item.completed)) ||
    (checklistItems.length === 0 && completionPct < 100);
  const loyaltyPoints = profileData?.loyaltyPoints ?? 0;

  const memberSince = formatMemberSince(user.created_at);

  const getCompletionItemRoute = (id: string): string | null => {
    switch (id) {
      case "photo":
      case "preferred_name":
      case "bio":
      case "emergency_contact":
        return "/(app)/account-settings/personal-info";
      case "email":
      case "phone":
        return "/(app)/account-settings/login-and-security";
      case "address":
        return "/(app)/account-settings/addresses";
      case "identity":
        return "/(app)/account-settings/identity-verification";
      case "profile_questions":
      case "interests":
      case "beauty_preferences":
        return "/(app)/account-settings/profile-details";
      default:
        return null;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.gray[50] }} accessibilityLabel="Profile screen" accessibilityRole="none">
      <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.gray[50] }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: tabScrollPaddingBottom, ...contentContainerStyle }}
        contentInsetAdjustmentBehavior="automatic"
        accessibilityLabel="Profile content"
        accessibilityRole="none"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* ── Profile header ── */}
        <View style={[contentContainerStyle, { backgroundColor: Colors.white, paddingBottom: 24 }]}>
          <View style={{ paddingHorizontal: contentPadding, paddingTop: 16, marginBottom: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>Profile</Text>
          </View>

        {profileLoadError && (
          <TouchableOpacity
            onPress={handleRefresh}
            style={{ marginHorizontal: contentPadding, marginBottom: 12, backgroundColor: "#FEF2F2", borderRadius: 8, padding: 12, flexDirection: "row", alignItems: "center" }}
            activeOpacity={0.7}
          >
            <Ionicons name="alert-circle-outline" size={18} color="#DC2626" style={{ marginRight: 8 }} />
            <Text style={{ flex: 1, fontSize: 13, color: "#991B1B" }}>Couldn&apos;t load profile details.</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.primary }}>Retry</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() =>
            router.push("/(app)/account-settings/personal-info")
          }
          activeOpacity={0.7}
          style={{ paddingHorizontal: contentPadding }}
          accessibilityLabel="Show profile, opens personal info"
          accessibilityRole="button"
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {/* Avatar */}
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: hasAvatar ? "transparent" : Colors.primaryLight,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                ...shadow(2, 8, 0.12, 3),
              }}
            >
              {hasAvatar ? (
                <Image
                  source={{ uri: avatarUrl! }}
                  style={{ width: 72, height: 72 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              ) : (
                <Text
                  style={{
                    fontSize: 30,
                    fontWeight: "700",
                    color: Colors.primary,
                  }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>

            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900] }}>
                {displayName}
              </Text>
              {memberSince ? (
                <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 2 }}>
                  Member since {memberSince}
                </Text>
              ) : null}
              {profileData && profileData.ratingAverage > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                  <Ionicons name="star" size={14} color="#EAB308" />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[800], marginLeft: 4 }}>
                    {profileData.ratingAverage.toFixed(1)}
                  </Text>
                  <Text style={{ fontSize: 13, color: Colors.gray[500], marginLeft: 4 }}>
                    ({profileData.reviewCount} {profileData.reviewCount === 1 ? "review" : "reviews"})
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 14, fontWeight: "500", marginTop: 4, color: Colors.primary }}>
                Show profile
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
          </View>
        </TouchableOpacity>

        {/* Verification badges: green check when done, red cross when mandatory and missing */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: contentPadding, marginTop: 16 }}>
          <View style={{ marginRight: 12 }}>
            <VerificationBadge
              icon="mail-outline"
              label="Email"
              verified={emailVerified}
              required
            />
          </View>
          <View style={{ marginRight: 12 }}>
            <VerificationBadge
              icon="call-outline"
              label="Phone"
              verified={phoneVerified}
            />
          </View>
          <VerificationBadge
            icon="shield-checkmark-outline"
            label="Identity"
            verified={isVerified}
          />
        </View>
        <TouchableOpacity
          onPress={() => router.push("/(app)/account-settings/login-and-security")}
          style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 4 }}
          activeOpacity={0.7}
          accessibilityLabel="Change email or phone number"
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>Change email or phone →</Text>
        </TouchableOpacity>
      </View>

      {/* ── Profile completion card ──
          §Customer-audit 2026-04: previously this rendered whenever
          `checklistItems.length > 0`, but the API always returns all items
          (with a `completed` flag), so the "Complete your profile" nag card
          stayed visible even after the user hit 100%. Hide the card once the
          user has nothing left to complete — the "Account settings" tile
          below still lets them edit anything they want. */}
      {hasIncompleteChecklist && (
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <View style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray[100] }}>
            <TouchableOpacity
              onPress={() => router.push("/(app)/account-settings/personal-info")}
              activeOpacity={0.8}
              style={{ flexDirection: "row", alignItems: "flex-start" }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: Colors.primaryLight,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <Ionicons name="sparkles" size={22} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>
                  Complete your profile
                </Text>
                <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>
                  Make booking easier and help providers give you the best experience
                </Text>
                {/* Progress bar */}
                <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      flex: 1,
                      height: 6,
                      backgroundColor: Colors.gray[100],
                      borderRadius: 3,
                      overflow: "hidden",
                      marginRight: 10,
                    }}
                  >
                    <View
                      style={{
                        width: `${completionPct}%`,
                        height: "100%",
                        backgroundColor: Colors.primary,
                        borderRadius: 3,
                      }}
                    />
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[600] }}>
                    {completionPct}%
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
            {/* Checklist: incomplete items are tappable and deep-link to the right screen */}
            {checklistItems.length > 0 && (
              <View style={{ marginTop: 12 }}>
                {checklistItems.map((item, index) => {
                  const done = item.completed;
                  const mandatoryMissing = !item.completed && item.required;
                  const iconName = done
                    ? "checkmark-circle"
                    : mandatoryMissing
                      ? "close-circle"
                      : "ellipse-outline";
                  const iconColor = done ? "#16A34A" : mandatoryMissing ? "#ef4444" : "#9ca3af";
                  const route = getCompletionItemRoute(item.id);
                  const rowContent = (
                    <>
                      <Ionicons
                        name={iconName as keyof typeof Ionicons.glyphMap}
                        size={18}
                        color={iconColor}
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 14,
                          color: done ? "#16A34A" : mandatoryMissing ? "#b91c1c" : Colors.gray[600],
                        }}
                      >
                        {item.label}
                      </Text>
                    </>
                  );
                  if (!done && route) {
                    return (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() => { haptic.light(); router.push(route as any); }}
                        style={{ flexDirection: "row", alignItems: "center", marginTop: index === 0 ? 0 : 8, paddingVertical: 4 }}
                        activeOpacity={0.7}
                        accessibilityLabel={`Complete: ${item.label}`}
                        accessibilityRole="button"
                      >
                        {rowContent}
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <View key={item.id} style={{ flexDirection: "row", alignItems: "center", marginTop: index === 0 ? 0 : 8 }}>
                      {rowContent}
                    </View>
                  );
                })}
              </View>
            )}
            <TouchableOpacity
              onPress={() => router.push("/(app)/account-settings")}
              style={{ marginTop: 12, alignSelf: "flex-start", paddingVertical: 4 }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>
                Account settings →
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Loyalty highlight ── */}
      <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
        <TouchableOpacity
          onPress={() => router.push("/(app)/account-settings/loyalty")}
          activeOpacity={0.8}
          style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray[100], flexDirection: "row", alignItems: "center" }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "#DCFCE7",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Ionicons name="trophy" size={22} color="#22C55E" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>
              {loyaltyPoints.toLocaleString()} points
            </Text>
            <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
              Earn points on every booking
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.gray[300]} />
        </TouchableOpacity>
      </View>

      {/* ── Quick actions ── */}
      <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
        <View style={{ flexDirection: "row" }}>
          <View style={{ marginRight: 12 }}>
            <QuickAction
              icon="calendar-outline"
              label="Bookings"
              onPress={() =>
                router.push("/(app)/account-settings/bookings")
              }
            />
          </View>
          <View style={{ marginRight: 12 }}>
            <QuickAction
              icon="bag-outline"
              label="Orders"
              onPress={() => router.push("/(app)/product-orders" as any)}
            />
          </View>
          <QuickAction
            icon="wallet-outline"
            label="Wallet"
            onPress={() =>
              router.push("/(app)/account-settings/wallet")
            }
          />
          <QuickAction
            icon="heart-outline"
            label="Saved"
            onPress={() => router.push("/(app)/(tabs)/saved" as any)}
          />
        </View>
      </View>

      {/* ── Settings ── */}
      <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 }}>
          Settings
        </Text>
        <View style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], overflow: "hidden" }}>
          <MenuItem
            icon="settings-outline"
            label="Account settings"
            onPress={() => router.push("/(app)/account-settings")}
          />
          <MenuItem
            icon="card-outline"
            label="Payment methods"
            onPress={() =>
              router.push("/(app)/account-settings/payments")
            }
          />
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push("/(app)/notifications")}
            badge={unreadCount > 0 ? unreadCount : undefined}
          />
          <MenuItem
            icon="globe-outline"
            label="Language & region"
            onPress={() =>
              router.push("/(app)/account-settings/preferences")
            }
          />
          <MenuItem
            icon="shield-checkmark-outline"
            label="Privacy & sharing"
            onPress={() =>
              router.push("/(app)/account-settings/privacy-and-sharing")
            }
            last
          />
        </View>
      </View>

      {/* ── Referral banner (amount + currency from GET /api/me/referrals; hidden when program disabled) ── */}
      {referralBanner.loaded && referralBanner.enabled ? (
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <TouchableOpacity
            onPress={async () => {
              haptic.light();
              try {
                let link = referralBanner.link;
                if (!link) {
                  const res = await api.get<{ referral_link?: string }>("/api/me/referrals");
                  if (!res.error && res.data?.referral_link) link = res.data.referral_link.trim();
                }
                const shareLink = link || APP_URL;
                await Share.share({
                  message: t("customer.referral.shareMessage", { link: shareLink }),
                  title: t("customer.referral.shareTitle"),
                  ...(Platform.OS === "ios" && link ? { url: link } : {}),
                });
              } catch {
                await Share.share({
                  message: t("customer.referral.shareMessage", { link: APP_URL }),
                  title: t("customer.referral.shareTitle"),
                });
              }
            }}
            activeOpacity={0.8}
            style={{ borderRadius: 16, overflow: "hidden", backgroundColor: "#FDF2F8" }}
            accessibilityLabel={
              referralBanner.amountFormatted
                ? `${t("customer.referral.title")}. ${t("customer.referral.subtitleWithReward", { amount: referralBanner.amountFormatted })}`
                : `${t("customer.referral.title")}. ${t("customer.referral.subtitleGeneric")}`
            }
            accessibilityRole="button"
          >
            <View style={{ padding: 16, flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>
                  {t("customer.referral.title")}
                </Text>
                <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 4 }}>
                  {referralBanner.amountFormatted
                    ? t("customer.referral.subtitleWithReward", { amount: referralBanner.amountFormatted })
                    : t("customer.referral.subtitleGeneric")}
                </Text>
              </View>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "rgba(255, 0, 119, 0.1)",
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: 12,
                }}
              >
                <Ionicons name="gift" size={22} color={Colors.primary} />
              </View>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Support ── */}
      <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 }}>
          Support
        </Text>
        <View style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], overflow: "hidden" }}>
          <MenuItem
            icon="help-circle-outline"
            label="Help centre"
            onPress={() => router.push("/(app)/help")}
          />
          <MenuItem
            icon="chatbubble-ellipses-outline"
            label="Give us feedback"
            onPress={() => {
              const iosAppId =
                IOS_APP_STORE_ID && IOS_APP_STORE_ID !== "0000000000" ? IOS_APP_STORE_ID : "";
              if (Platform.OS === "ios" && iosAppId) {
                Linking.openURL(`https://apps.apple.com/app/id${iosAppId}?action=write-review`).catch(() => {
                  Linking.openURL(`https://apps.apple.com/app/id${iosAppId}`).catch(() => {});
                });
              } else if (Platform.OS === "android") {
                Linking.openURL("https://play.google.com/store/apps/details?id=com.beautonomi").catch(() => {});
              } else {
                router.push({
                  pathname: "/(app)/in-app-browser",
                  params: {
                    url: encodeURIComponent(`${APP_URL}/help-center?topic=feedback`),
                    title: "Feedback",
                  },
                });
              }
            }}
          />
          <MenuItem
            icon="information-circle-outline"
            label="About Beautonomi"
            onPress={() => router.push("/(app)/about")}
            last
          />
        </View>
      </View>

      {/* ── Become a provider ── */}
      <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
        <TouchableOpacity
          onPress={() =>
            router.push({ pathname: "/(app)/in-app-browser", params: { url: encodeURIComponent(`${APP_URL}/provider/onboarding`), title: "Become a provider" } })
          }
          activeOpacity={0.8}
          style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], padding: 16, flexDirection: "row", alignItems: "center" }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "#F0FDF4",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Ionicons name="storefront-outline" size={22} color="#16A34A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>
              Become a beauty provider
            </Text>
            <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 2 }}>
              Offer your services on Beautonomi
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.gray[300]} />
        </TouchableOpacity>
      </View>

      {/* ── Sign out ── */}
      <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
        <TouchableOpacity
          onPress={() =>
            Alert.alert("Log out", "Are you sure you want to log out?", [
              { text: "Cancel", style: "cancel" },
              { text: "Log out", style: "destructive", onPress: () => void signOut() },
            ])
          }
          style={{ paddingVertical: 16, alignItems: "center" }}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Text style={{ fontSize: 14, fontWeight: "500", color: "#EF4444" }}>
            Log out
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Footer ── */}
      <View style={{ alignItems: "center", marginTop: 8, paddingBottom: 16 }}>
        <Text style={{ fontSize: 12, color: Colors.gray[300] }}>
          Beautonomi v{Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </View>
      </ScrollView>
    </View>
  );
}

/* ─── Logged-out state ─── */
function LoggedOutProfile() {
  const tabScrollPaddingBottom = useTabContentPaddingBottom(24);
  return (
    <View style={{ flex: 1, backgroundColor: Colors.white }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.white }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: tabScrollPaddingBottom }}
      >
      <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>Profile</Text>
        <Text style={{ fontSize: 16, color: Colors.gray[500], marginTop: 8 }}>
          Log in to start booking beauty services, managing your appointments, and more.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
        <TouchableOpacity
          onPress={() => router.replace("/(auth)/login")}
          style={{ backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center" }}
          accessibilityRole="button"
        >
          <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>Log in</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 16 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
            Don&apos;t have an account?{" "}
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/signup")}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>
              Sign up
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Separator */}
      <View style={{ marginHorizontal: 20, marginTop: 32, marginBottom: 24, borderTopWidth: 1, borderTopColor: Colors.gray[200] }} />

      {/* Menu */}
      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ backgroundColor: Colors.white, borderRadius: 16, overflow: "hidden" }}>
          <MenuItem
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push("/(app)/account-settings/preferences")}
          />
          <MenuItem
            icon="help-circle-outline"
            label="Help centre"
            onPress={() => router.push("/(app)/help")}
          />
          <MenuItem
            icon="information-circle-outline"
            label="About Beautonomi"
            onPress={() => router.push("/(app)/about")}
            last
          />
        </View>
      </View>

      <View style={{ alignItems: "center", marginTop: 32, paddingBottom: 16 }}>
        <Text style={{ fontSize: 12, color: Colors.gray[300] }}>
          Beautonomi v{Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </View>
      </ScrollView>
    </View>
  );
}

/* ─── Verification badge: green check when completed, red cross when mandatory and not done ─── */
function VerificationBadge({
  icon,
  label,
  verified,
  required,
}: {
  icon: IconName;
  label: string;
  verified: boolean;
  required?: boolean;
}) {
  const isMandatoryMissing = !verified && required;
  const iconName = verified ? "checkmark-circle" : isMandatoryMissing ? "close-circle" : icon;
  const color = verified ? "#16A34A" : isMandatoryMissing ? "#ef4444" : "#d1d5db";
  const textColor = verified ? "#16A34A" : isMandatoryMissing ? "#b91c1c" : "#9ca3af";
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Ionicons name={iconName as any} size={16} color={color} />
      <Text style={{ fontSize: 12, marginLeft: 4, color: textColor }}>
        {label}
      </Text>
    </View>
  );
}

/* ─── Quick action tile ─── */
function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{ flex: 1, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], alignItems: "center", paddingVertical: 16 }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: Colors.gray[50],
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
        }}
      >
        <Ionicons name={icon} size={20} color={Colors.primary} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[700] }}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ─── Menu item ─── */
function MenuItem({
  icon,
  label,
  onPress,
  last,
  badge,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  last?: boolean;
  badge?: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
        !last ? { borderBottomWidth: 1, borderBottomColor: Colors.gray[100] } : undefined,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={20}
        color={Colors.gray[600]}
        style={{ marginRight: 14 }}
      />
      <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{label}</Text>
      {badge != null && badge > 0 ? (
        <View
          style={{
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: Colors.primary,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 6,
            marginRight: 8,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={Colors.gray[300]} />
    </TouchableOpacity>
  );
}
