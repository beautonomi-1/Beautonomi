import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { BeautonomiLogo } from "@/components/ui/BeautonomiLogo";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { clearPortalCache } from "@/lib/portal-cache";
import { persistActiveProviderOrgHint } from "@/lib/active-provider-api-hint";
import { useResponsive } from "@/hooks/useResponsive";

type ValidateResponse = {
  valid: boolean;
  already_accepted: boolean;
  expired: boolean;
  business_name: string | null;
  staff_name: string | null;
  email_hint: string | null;
};

type AppLinks = {
  ios: string | null;
  android: string | null;
  huawei: string | null;
};

export default function StaffJoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token.trim() : "";
  const { user, loading: authLoading } = useAuth();
  const { contentMaxWidth, screenPadding } = useResponsive();

  const [preview, setPreview] = useState<ValidateResponse | null>(null);
  const [appLinks, setAppLinks] = useState<AppLinks | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError("Missing invite token. Open the link from your invitation email.");
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await api.get<ValidateResponse>(
        `/api/provider/staff/join/validate?token=${encodeURIComponent(token)}`,
      );
      if (cancelled) return;
      if (res.error || !res.data) {
        setLoadError(res.error?.message ?? "Could not load invite");
        return;
      }
      setPreview(res.data);
      if (res.data.expired && !res.data.already_accepted) {
        setLoadError("This invite has expired. Ask your manager to resend.");
      }
    })();
    (async () => {
      const res = await api.get<AppLinks>("/api/public/apps?type=provider");
      if (!cancelled && res.data) setAppLinks(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const goToAppHome = useCallback(() => {
    clearPortalCache();
    router.replace("/" as never);
  }, [router]);

  const acceptInvite = useCallback(async () => {
    if (!token || !user) return;
    setAccepting(true);
    setAcceptError(null);
    const res = await api.post<{
      data?: { role?: string; provider_id?: string };
      provider_id?: string;
    }>("/api/provider/staff/join/accept", {
      token,
    });
    setAccepting(false);
    if (res.error) {
      setAcceptError(res.error.message ?? "Could not accept invite");
      return;
    }
    const providerId = res.data?.provider_id ?? (res as { provider_id?: string }).provider_id;
    if (providerId) {
      await persistActiveProviderOrgHint(user.id, providerId);
    }
    goToAppHome();
  }, [token, user, goToAppHome]);

  useEffect(() => {
    if (authLoading || !user || !token || !preview?.valid) return;
    if (preview.expired && !preview.already_accepted) return;
    void acceptInvite();
  }, [authLoading, user, token, preview, acceptInvite]);

  const businessName = preview?.business_name ?? "your team";

  return (
    <ScreenContainer scrollable={false} edges={["top", "bottom"]} reserveTabBarSpace={false}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: screenPadding,
          paddingVertical: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" }}>
          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <BeautonomiLogo size={40} />
          </View>

          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 24,
              borderWidth: 1,
              borderColor: "#f3f4f6",
            }}
          >
            <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 8 }}>
              Join {businessName}
            </Text>
            <Text style={{ fontSize: 15, color: "#4b5563", marginBottom: 20 }}>
              {preview?.staff_name
                ? `Hi ${preview.staff_name}, you've been invited to join the team on Beautonomi.`
                : "You've been invited to join a team on Beautonomi."}
            </Text>

            {loadError ? (
              <Text style={{ color: "#dc2626", marginBottom: 12, fontSize: 14 }}>{loadError}</Text>
            ) : null}
            {acceptError ? (
              <Text style={{ color: "#dc2626", marginBottom: 12, fontSize: 14 }}>{acceptError}</Text>
            ) : null}

            {authLoading ? (
              <ActivityIndicator color={Colors.primary} />
            ) : !user ? (
              <>
                <Text style={{ fontSize: 14, color: "#4b5563", marginBottom: 16 }}>
                  Sign in with the email that received this invite
                  {preview?.email_hint ? ` (${preview.email_hint})` : ""}. Use the set-password
                  link from your invitation email, or sign in with email OTP — you do not need an
                  existing password.
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: Colors.primary,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                  onPress={() => {
                    const email = preview?.email_hint?.trim();
                    const qs = new URLSearchParams({ joinToken: token });
                    if (email) qs.set("email", email);
                    router.push(`/(auth)/login?${qs.toString()}` as never);
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Sign in to continue</Text>
                </TouchableOpacity>
              </>
            ) : accepting ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={{ color: "#6b7280" }}>Setting up your access…</Text>
              </View>
            ) : preview?.already_accepted ? (
              <TouchableOpacity
                style={{
                  backgroundColor: Colors.primary,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                }}
                onPress={goToAppHome}
              >
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Open app</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={{
                  backgroundColor: Colors.primary,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  opacity: preview?.valid ? 1 : 0.5,
                }}
                disabled={!preview?.valid}
                onPress={acceptInvite}
              >
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Accept invite</Text>
              </TouchableOpacity>
            )}
          </View>

          {(appLinks?.ios || appLinks?.android) && (
            <View style={{ marginTop: 24, alignItems: "center" }}>
              <Text style={{ fontWeight: "600", color: "#111827", marginBottom: 8 }}>
                Get the Provider app
              </Text>
              {appLinks.ios ? (
                <TouchableOpacity onPress={() => Linking.openURL(appLinks.ios!)}>
                  <Text style={{ color: Colors.primary, marginBottom: 4 }}>Download for iPhone</Text>
                </TouchableOpacity>
              ) : null}
              {appLinks.android ? (
                <TouchableOpacity onPress={() => Linking.openURL(appLinks.android!)}>
                  <Text style={{ color: Colors.primary }}>Download for Android</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
