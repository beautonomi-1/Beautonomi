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
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useAuth } from "@/providers/AuthProvider";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors, shadow } from "@/constants/colors";
import { APP_URL } from "@/config/public-env";
import { api } from "@/lib/api-client";

type IconName = keyof typeof Ionicons.glyphMap;

export default function ProfileScreen() {
  useScreenTracking("Profile");
  const { user, signOut } = useAuth();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const contentContainerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }
    : {};
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
    <View style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.gray[50] }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120, ...contentContainerStyle }}
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
        <View style={[contentContainerStyle, { backgroundColor: Colors.white, paddingBottom: 24 }]}>
          <View style={{ paddingHorizontal: contentPadding, paddingTop: 16, marginBottom: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>Profile</Text>
          </View>

        <TouchableOpacity
          onPress={() =>
            router.push("/(app)/account-settings/personal-info")
          }
          activeOpacity={0.7}
          style={{ paddingHorizontal: contentPadding }}
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

            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900] }}>
                {displayName}
              </Text>
              {memberSince ? (
                <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 2 }}>
                  Member since {memberSince}
                </Text>
              ) : null}
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
      </View>

      {/* ── Profile completion card ── */}
      {(completionPct < 100 || checklistItems.length > 0) && (
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <TouchableOpacity
            onPress={() =>
              router.push("/(app)/account-settings/personal-info")
            }
            activeOpacity={0.8}
            style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray[100] }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
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
                {/* Checklist */}
                {checklistItems.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    {checklistItems.slice(0, 5).map((item, index) => {
                      const done = item.completed;
                      const mandatoryMissing = !item.completed && item.required;
                      const iconName = done
                        ? "checkmark-circle"
                        : mandatoryMissing
                          ? "close-circle"
                          : "ellipse-outline";
                      const iconColor = done ? "#16A34A" : mandatoryMissing ? "#ef4444" : "#9ca3af";
                      return (
                        <View key={item.id} style={{ flexDirection: "row", alignItems: "center", marginTop: index === 0 ? 0 : 8 }}>
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
              backgroundColor: "#FEF3C7",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Ionicons name="trophy" size={22} color="#D97706" />
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
            onPress={() =>
              router.push("/(app)/account-settings/wishlists")
            }
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
      <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
        <TouchableOpacity
          onPress={() => {
            Share.share({
              message: `I love booking beauty services on Beautonomi! Join me: ${APP_URL}`,
              title: "Join Beautonomi",
            });
          }}
          activeOpacity={0.8}
          style={{ borderRadius: 16, overflow: "hidden", backgroundColor: "#FDF2F8" }}
        >
          <View style={{ padding: 16, flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>
                Invite friends
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 4 }}>
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
      <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
        <TouchableOpacity
          onPress={() =>
            Linking.openURL(`${APP_URL}/provider/onboarding`)
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
          onPress={() => signOut()}
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
  return (
    <View style={{ flex: 1, backgroundColor: Colors.white }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.white }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
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
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  last?: boolean;
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
      <Ionicons name="chevron-forward" size={16} color={Colors.gray[300]} />
    </TouchableOpacity>
  );
}
