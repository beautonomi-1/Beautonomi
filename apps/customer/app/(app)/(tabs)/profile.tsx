import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Share,
  Linking,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useAuth } from "@/providers/AuthProvider";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors, shadow } from "@/constants/colors";
import { APP_URL } from "@/config/public-env";
import { api } from "@/lib/api-client";

type IconName = keyof typeof Ionicons.glyphMap;

export default function ProfileScreen() {
  useScreenTracking("Profile");
  const { user, signOut } = useAuth();
  type ChecklistItem = { id: string; label: string; completed: boolean; required?: boolean };
  const [profileData, setProfileData] = useState<{
    completion: number;
    topItems: { id: string; label: string }[];
    checklistItems: ChecklistItem[];
    loyaltyPoints: number;
    verified: boolean;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfileData = useCallback(async () => {
    if (!user) return;
    try {
      const [compRes, loyaltyRes, verifyRes] = await Promise.allSettled([
        api.get<any>("/api/me/profile-completion"),
        api.get<any>("/api/me/loyalty"),
        api.get<any>("/api/me/verification"),
      ]);

      const comp =
        compRes.status === "fulfilled" ? compRes.value.data : null;
      const loyalty =
        loyaltyRes.status === "fulfilled" ? loyaltyRes.value.data : null;
      const verify =
        verifyRes.status === "fulfilled" ? verifyRes.value.data : null;

      setProfileData({
        completion: comp?.percentage ?? 0,
        topItems: comp?.topItems ?? [],
        checklistItems: comp?.checklistItems ?? [],
        loyaltyPoints: loyalty?.points_balance ?? 0,
        verified: verify?.verified ?? false,
      });
    } catch {}
  }, [user]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfileData();
    setRefreshing(false);
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

  const hasAvatar = !!user.user_metadata?.avatar_url;
  const emailVerified = !!user.email_confirmed_at;
  const phoneVerified = !!user.phone_confirmed_at || !!user.phone;
  const isVerified = profileData?.verified ?? false;
  const completionPct = profileData?.completion ?? 0;
  const checklistItems = profileData?.checklistItems ?? [];
  const loyaltyPoints = profileData?.loyaltyPoints ?? 0;

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ paddingBottom: 120 }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={Colors.primary}
        />
      }
    >
      {/* ── Profile header ── */}
      <View className="bg-white pb-6">
        <View className="px-5 pt-4 mb-5">
          <Text className="text-2xl font-bold text-gray-900">Profile</Text>
        </View>

        <TouchableOpacity
          onPress={() =>
            router.push("/(app)/account-settings/personal-info")
          }
          activeOpacity={0.7}
          className="px-5"
        >
          <View className="flex-row items-center">
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
                  source={{ uri: user.user_metadata.avatar_url }}
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

            <View className="flex-1 ml-4">
              <Text className="text-xl font-bold text-gray-900">
                {displayName}
              </Text>
              {memberSince ? (
                <Text className="text-sm text-gray-500 mt-0.5">
                  Member since {memberSince}
                </Text>
              ) : null}
              <Text className="text-sm font-medium mt-1" style={{ color: Colors.primary }}>
                Show profile
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
          </View>
        </TouchableOpacity>

        {/* Verification badges: green check when done, red cross when mandatory and missing */}
        <View className="flex-row items-center px-5 mt-4 gap-3">
          <VerificationBadge
            icon="mail-outline"
            label="Email"
            verified={emailVerified}
            required
          />
          <VerificationBadge
            icon="call-outline"
            label="Phone"
            verified={phoneVerified}
          />
          <VerificationBadge
            icon="shield-checkmark-outline"
            label="Identity"
            verified={isVerified}
          />
        </View>
      </View>

      {/* ── Profile completion card ── */}
      {(completionPct < 100 || checklistItems.length > 0) && (
        <View className="px-4 mt-4">
          <TouchableOpacity
            onPress={() =>
              router.push("/(app)/account-settings/personal-info")
            }
            activeOpacity={0.8}
            className="bg-white rounded-2xl p-4 border border-gray-100"
          >
            <View className="flex-row items-start">
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
              <View className="flex-1">
                <Text className="text-base font-semibold text-gray-900">
                  Complete your profile
                </Text>
                <Text className="text-sm text-gray-500 mt-1">
                  Make booking easier and help providers give you the best experience
                </Text>
                {/* Progress bar */}
                <View className="mt-3 flex-row items-center">
                  <View
                    style={{
                      flex: 1,
                      height: 6,
                      backgroundColor: "#f3f4f6",
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
                  <Text className="text-xs font-semibold text-gray-600">
                    {completionPct}%
                  </Text>
                </View>
                {/* Checklist: green check = completed, red cross = mandatory incomplete */}
                {checklistItems.length > 0 && (
                  <View className="mt-3 gap-2">
                    {checklistItems.slice(0, 5).map((item) => {
                      const done = item.completed;
                      const mandatoryMissing = !item.completed && item.required;
                      const iconName = done
                        ? "checkmark-circle"
                        : mandatoryMissing
                          ? "close-circle"
                          : "ellipse-outline";
                      const iconColor = done ? "#16A34A" : mandatoryMissing ? "#ef4444" : "#9ca3af";
                      return (
                        <View key={item.id} className="flex-row items-center">
                          <Ionicons
                            name={iconName as keyof typeof Ionicons.glyphMap}
                            size={18}
                            color={iconColor}
                            style={{ marginRight: 8 }}
                          />
                          <Text
                            className="flex-1 text-sm"
                            style={{
                              color: done ? "#16A34A" : mandatoryMissing ? "#b91c1c" : "#6b7280",
                            }}
                          >
                            {item.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Loyalty highlight ── */}
      <View className="px-4 mt-4">
        <TouchableOpacity
          onPress={() => router.push("/(app)/account-settings/loyalty")}
          activeOpacity={0.8}
          className="bg-white rounded-2xl p-4 border border-gray-100 flex-row items-center"
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "#FEF3C7",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Ionicons name="trophy" size={22} color="#D97706" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-gray-900">
              {loyaltyPoints.toLocaleString()} points
            </Text>
            <Text className="text-sm text-gray-500">
              Earn points on every booking
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
        </TouchableOpacity>
      </View>

      {/* ── Quick actions ── */}
      <View className="px-4 mt-4">
        <View className="flex-row gap-3">
          <QuickAction
            icon="calendar-outline"
            label="Bookings"
            onPress={() =>
              router.push("/(app)/account-settings/bookings")
            }
          />
          <QuickAction
            icon="bag-outline"
            label="Orders"
            onPress={() => router.push("/(app)/product-orders" as any)}
          />
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
            onPress={() =>
              router.push("/(app)/account-settings/wishlists")
            }
          />
        </View>
      </View>

      {/* ── Settings ── */}
      <View className="px-4 mt-5">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
          Settings
        </Text>
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
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

      {/* ── Referral banner ── */}
      <View className="px-4 mt-5">
        <TouchableOpacity
          onPress={() => {
            Share.share({
              message: `I love booking beauty services on Beautonomi! Join me: ${APP_URL}`,
              title: "Join Beautonomi",
            });
          }}
          activeOpacity={0.8}
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "#FDF2F8" }}
        >
          <View className="p-4 flex-row items-center">
            <View className="flex-1">
              <Text className="text-base font-semibold text-gray-900">
                Invite friends
              </Text>
              <Text className="text-sm text-gray-600 mt-1">
                Share Beautonomi and earn credits when friends book
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

      {/* ── Support ── */}
      <View className="px-4 mt-5">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
          Support
        </Text>
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <MenuItem
            icon="help-circle-outline"
            label="Help centre"
            onPress={() => router.push("/(app)/help")}
          />
          <MenuItem
            icon="chatbubble-ellipses-outline"
            label="Give us feedback"
            onPress={() =>
              Linking.openURL(`${APP_URL}/contact`)
            }
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
      <View className="px-4 mt-5">
        <TouchableOpacity
          onPress={() =>
            Linking.openURL(`${APP_URL}/provider/onboarding`)
          }
          activeOpacity={0.8}
          className="bg-white rounded-2xl border border-gray-100 p-4 flex-row items-center"
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
          <View className="flex-1">
            <Text className="text-base font-semibold text-gray-900">
              Become a beauty provider
            </Text>
            <Text className="text-sm text-gray-500 mt-0.5">
              Offer your services on Beautonomi
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
        </TouchableOpacity>
      </View>

      {/* ── Sign out ── */}
      <View className="px-4 mt-5">
        <TouchableOpacity
          onPress={() => signOut()}
          className="py-4 items-center"
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Text className="text-sm font-medium" style={{ color: "#EF4444" }}>
            Log out
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Footer ── */}
      <View className="items-center mt-2 pb-4">
        <Text className="text-xs text-gray-300">
          Beautonomi v{Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </View>
    </ScrollView>
  );
}

/* ─── Logged-out state ─── */
function LoggedOutProfile() {
  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      <View className="px-5 pt-6">
        <Text className="text-2xl font-bold text-gray-900">Profile</Text>
        <Text className="text-base text-gray-500 mt-2">
          Log in to start booking beauty services, managing your appointments, and more.
        </Text>
      </View>

      <View className="px-5 mt-8">
        <TouchableOpacity
          onPress={() => router.replace("/(auth)/login")}
          style={{ backgroundColor: Colors.primary }}
          className="py-4 rounded-xl items-center"
          accessibilityRole="button"
        >
          <Text className="text-white font-semibold text-base">Log in</Text>
        </TouchableOpacity>

        <View className="flex-row justify-center mt-4">
          <Text className="text-sm text-gray-500">
            Don&apos;t have an account?{" "}
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/signup")}
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: Colors.primary }}
            >
              Sign up
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Separator */}
      <View className="mx-5 mt-8 mb-6 border-t border-gray-200" />

      {/* Menu */}
      <View className="px-4">
        <View className="bg-white rounded-2xl overflow-hidden">
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

      <View className="items-center mt-8 pb-4">
        <Text className="text-xs text-gray-300">
          Beautonomi v{Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </View>
    </ScrollView>
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
    <View className="flex-row items-center">
      <Ionicons name={iconName as any} size={16} color={color} />
      <Text className="text-xs ml-1" style={{ color: textColor }}>
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
      className="flex-1 bg-white rounded-2xl border border-gray-100 items-center py-4"
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: "#f9fafb",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
        }}
      >
        <Ionicons name={icon} size={20} color={Colors.primary} />
      </View>
      <Text className="text-xs font-medium text-gray-700">{label}</Text>
    </TouchableOpacity>
  );
}

/* ─── Menu item ─── */
function MenuItem({
  icon,
  label,
  onPress,
  last,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center px-4 py-3.5"
      style={
        !last
          ? { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }
          : undefined
      }
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={20}
        color="#6b7280"
        style={{ marginRight: 14 }}
      />
      <Text className="flex-1 text-sm font-medium text-gray-900">{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
    </TouchableOpacity>
  );
}
