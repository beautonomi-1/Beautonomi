import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { verificationPolicyFromBundle } from "@/lib/verification/policy";
import { Colors } from "@/constants/colors";
import { SCREEN_PADDING } from "@/constants/layout";

const DISMISS_KEY_PREFIX = "identity-verification-banner-dismissed-v1:";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type VerificationResponse = {
  verified?: boolean;
  required_for_customers?: boolean;
};

export function IdentityVerificationBanner() {
  const { t } = useTranslation();
  const ivb = useCallback(
    (key: string) => t(`customer.mobile.screens.identityVerificationBanner.${key}`) as string,
    [t],
  );
  const { user } = useAuth();
  const { bundle } = useConfigBundle();
  const policy = verificationPolicyFromBundle(bundle);
  const [visible, setVisible] = useState(false);
  const [required, setRequired] = useState(false);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setVisible(false);
      return;
    }
    try {
      const dismissRaw = await AsyncStorage.getItem(`${DISMISS_KEY_PREFIX}${user.id}`);
      if (dismissRaw) {
        const dismissedAt = Number(dismissRaw);
        if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_TTL_MS) {
          setVisible(false);
          return;
        }
      }

      const [onboardingRes, verificationRes] = await Promise.all([
        api.get<{ completed?: boolean }>("/api/me/onboarding/complete"),
        api.get<VerificationResponse>(
          `/api/me/verification?environment=${encodeURIComponent(bundle?.meta?.env ?? "production")}`,
        ),
      ]);

      if (onboardingRes.data?.completed !== true) {
        setVisible(false);
        return;
      }

      const verified = verificationRes.data?.verified === true;
      if (verified) {
        setVisible(false);
        return;
      }

      const isRequired =
        verificationRes.data?.required_for_customers ?? policy.required_for_customers;
      setRequired(isRequired);
      setVisible(true);
    } catch {
      setVisible(false);
    }
  }, [user?.id, bundle?.meta?.env, policy.required_for_customers]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void load();
  }, [load]);

  const handleDismiss = useCallback(async () => {
    setVisible(false);
    if (user?.id) {
      await AsyncStorage.setItem(`${DISMISS_KEY_PREFIX}${user.id}`, String(Date.now())).catch(
        () => {},
      );
    }
  }, [user?.id]);

  if (!visible) return null;

  const bg = required ? "#FFFBEB" : "#FFF5F9";
  const border = required ? "#FCD34D" : Colors.primary + "40";
  const titleColor = required ? "#92400E" : Colors.primary;
  const bodyColor = required ? "#B45309" : "#64748B";

  return (
    <View
      style={{
        marginHorizontal: SCREEN_PADDING,
        marginBottom: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: bg,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: required ? "#FEF3C7" : Colors.primary + "18",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color={titleColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: titleColor }}>
            {required ? ivb("requiredTitle") : ivb("optionalTitle")}
          </Text>
          <Text style={{ fontSize: 13, color: bodyColor, marginTop: 4, lineHeight: 18 }}>
            {required ? ivb("requiredBody") : ivb("optionalBody")}
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(app)/account-settings/identity-verification")}
            style={{
              marginTop: 10,
              alignSelf: "flex-start",
              backgroundColor: required ? "#F59E0B" : Colors.primary,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
            }}
            accessibilityRole="button"
            accessibilityLabel={ivb("verifyNowA11y")}
          >
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>{ivb("verifyNowCta")}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => void handleDismiss()} hitSlop={10} accessibilityLabel={ivb("dismissA11y")}>
          <Ionicons name="close" size={18} color={bodyColor} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
