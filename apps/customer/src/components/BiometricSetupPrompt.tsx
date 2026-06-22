import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useAuth } from "@/providers/AuthProvider";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";
import { isScreenshotMode } from "@/config/public-env";
import { Colors } from "@/constants/colors";
import {
  canShowBiometricSetupPrompt,
  clearBiometricPromptPending,
  hydrateBiometricPromptPending,
  isBiometricPromptPending,
  isBiometricSetupPromptDismissed,
  markBiometricSetupPromptDismissed,
  subscribeBiometricPromptPending,
} from "@/lib/biometric-setup-prompt";

function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    const apply = (enabled: boolean) => {
      if (mounted) setReduceMotion(enabled);
    };

    void AccessibilityInfo.isReduceMotionEnabled().then(apply);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", apply);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

function ScalePressable({
  onPress,
  disabled,
  style,
  children,
  reduceMotion,
  accessibilityRole,
  accessibilityLabel,
}: {
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  reduceMotion: boolean;
  accessibilityRole?: "button" | "link";
  accessibilityLabel?: string;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => {
          if (!reduceMotion && !disabled) scale.value = withSpring(0.96, { damping: 20, stiffness: 300 });
        }}
        onPressOut={() => {
          if (!reduceMotion) scale.value = withSpring(1, { damping: 20, stiffness: 300 });
        }}
        style={style}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function BiometricIllustration({ type }: { type: "face" | "fingerprint" | "iris" | "unknown" }) {
  if (type === "face") {
    return (
      <Svg width={72} height={72} viewBox="0 0 72 72" fill="none">
        <Circle cx="36" cy="36" r="28" stroke={Colors.primary} strokeWidth={2.5} opacity={0.25} />
        <Circle cx="36" cy="36" r="20" stroke={Colors.primary} strokeWidth={2.5} opacity={0.45} />
        <Rect x="24" y="28" width="24" height="24" rx="6" stroke={Colors.primary} strokeWidth={2.5} />
        <Path d="M30 40H42" stroke={Colors.primary} strokeWidth={2} strokeLinecap="round" opacity={0.6} />
        <Circle cx="30" cy="34" r="2" fill={Colors.primary} />
        <Circle cx="42" cy="34" r="2" fill={Colors.primary} />
      </Svg>
    );
  }

  return (
    <Svg width={72} height={72} viewBox="0 0 72 72" fill="none">
      <Circle cx="36" cy="36" r="28" stroke={Colors.primary} strokeWidth={2.5} opacity={0.25} />
      <Path
        d="M36 16C26 16 20 26 20 36C20 50 36 58 36 58C36 58 52 50 52 36C52 26 46 16 36 16Z"
        stroke={Colors.primary}
        strokeWidth={2.5}
        opacity={0.35}
      />
      <Path
        d="M28 34C28 30 31 26 36 26C41 26 44 30 44 34C44 40 36 48 36 48C36 48 28 40 28 34Z"
        fill={Colors.primary}
        opacity={0.85}
      />
      <Path d="M36 48V54" stroke={Colors.primary} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

function AnimatedPromptCard({
  visible,
  reduceMotion,
  children,
}: {
  visible: boolean;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  const backdropOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const cardOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const cardScale = useSharedValue(reduceMotion ? 1 : 0.94);
  const cardTranslateY = useSharedValue(reduceMotion ? 0 : 16);

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      backdropOpacity.value = 1;
      cardOpacity.value = 1;
      cardScale.value = 1;
      cardTranslateY.value = 0;
      return;
    }
    backdropOpacity.value = 0;
    cardOpacity.value = 0;
    cardScale.value = 0.94;
    cardTranslateY.value = 16;
    backdropOpacity.value = withTiming(1, { duration: 240 });
    cardOpacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    cardScale.value = withSpring(1, { damping: 18, stiffness: 180 });
    cardTranslateY.value = withSpring(0, { damping: 20, stiffness: 170 });
  }, [backdropOpacity, cardOpacity, cardScale, cardTranslateY, reduceMotion, visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }, { translateY: cardTranslateY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "center",
          paddingHorizontal: 24,
        },
        backdropStyle,
      ]}
    >
      <Animated.View
        style={[
          {
            backgroundColor: Colors.white,
            borderRadius: 20,
            padding: 28,
          },
          cardStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

function AnimatedBiometricIcon({
  biometricType,
  reduceMotion,
}: {
  biometricType: "face" | "fingerprint" | "iris" | "unknown";
  reduceMotion: boolean;
}) {
  const scale = useSharedValue(reduceMotion ? 1 : 0.7);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    scale.value = 0.7;
    opacity.value = 0;
    scale.value = withSpring(1, { damping: 14, stiffness: 150 });
    opacity.value = withTiming(1, { duration: 280 });
  }, [biometricType, opacity, reduceMotion, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={style}>
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 24,
          backgroundColor: Colors.primaryLight,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <BiometricIllustration type={biometricType} />
      </View>
    </Animated.View>
  );
}

export function BiometricSetupPrompt() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const biometric = useBiometricAuth();
  const { gate } = useNativePermissionsOnboardingGate();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabledConfirmation, setEnabledConfirmation] = useState(false);
  const [pendingRevision, setPendingRevision] = useState(0);
  const reduceMotion = useReduceMotion();

  const bp = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.loginSecurity.biometricSetupPrompt.${key}`;
      return (options != null ? t(fullKey as never, options as never) : t(fullKey as never)) as string;
    },
    [t],
  );

  useEffect(() => {
    if (!userId) return;
    void hydrateBiometricPromptPending(userId);
  }, [userId]);

  useEffect(() => subscribeBiometricPromptPending(() => setPendingRevision((n) => n + 1)), []);

  const biometricLabel =
    biometric.biometricType === "face"
      ? "Face ID"
      : biometric.biometricType === "fingerprint"
        ? "Fingerprint"
        : "Biometrics";

  const dismissPrompt = useCallback(async () => {
    setVisible(false);
    setEnabledConfirmation(false);
    await clearBiometricPromptPending(userId ?? undefined);
    if (userId) await markBiometricSetupPromptDismissed(userId);
  }, [userId]);

  const completeAfterEnable = useCallback(async () => {
    setEnabledConfirmation(true);
    await clearBiometricPromptPending(userId ?? undefined);
    setTimeout(() => {
      setVisible(false);
      setEnabledConfirmation(false);
    }, 2200);
  }, []);

  useEffect(() => {
    if (!userId) {
      setVisible(false);
      return;
    }

    let cancelled = false;

    const evaluate = async () => {
      await hydrateBiometricPromptPending(userId);
      if (cancelled) return;

      const permissionsPhase =
        gate.phase === "loading"
          ? "loading"
          : gate.phase === "needs_onboarding"
            ? "needs_onboarding"
            : "complete";

      const dismissed = await isBiometricSetupPromptDismissed(userId);
      if (cancelled) return;

      const eligible = canShowBiometricSetupPrompt({
        platform: Platform.OS,
        isScreenshotMode: isScreenshotMode(),
        isAvailable: biometric.isAvailable,
        isEnabled: biometric.isEnabled,
        dismissed,
        pending: isBiometricPromptPending(userId),
        pathname: pathname ?? "",
        permissionsPhase,
      });

      setVisible(eligible);
    };

    void evaluate();
    return () => {
      cancelled = true;
    };
  }, [
    userId,
    pathname,
    gate.phase,
    biometric.isAvailable,
    biometric.isEnabled,
    pendingRevision,
  ]);

  const onEnable = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await biometric.enable();
      if (ok) await completeAfterEnable();
    } finally {
      setBusy(false);
    }
  }, [biometric, completeAfterEnable]);

  const onNotNow = useCallback(async () => {
    await dismissPrompt();
  }, [dismissPrompt]);

  const onOpenSettings = useCallback(async () => {
    await dismissPrompt();
    router.push("/(app)/account-settings/login-and-security" as never);
  }, [dismissPrompt, router]);

  if (!visible) return null;

  const primaryButtonStyle = {
    backgroundColor: Colors.primary,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    minHeight: 52,
    marginBottom: 10,
  };

  const outlineButtonStyle = {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: Colors.gray[300],
  };

  return (
    <Modal
      visible
      animationType="none"
      transparent
      onRequestClose={() => void onNotNow()}
    >
      <AnimatedPromptCard visible={visible} reduceMotion={reduceMotion}>
        <AnimatedBiometricIcon biometricType={biometric.biometricType ?? "unknown"} reduceMotion={reduceMotion} />
        <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], marginBottom: 10, letterSpacing: -0.2 }}>
          {bp("title")}
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 24, color: Colors.gray[600], marginBottom: 24 }}>
          {enabledConfirmation ? bp("enabledConfirmation") : bp("body", { label: biometricLabel })}
        </Text>
        {enabledConfirmation ? null : (
          <>
        <ScalePressable
          onPress={() => void onEnable()}
          disabled={busy}
          reduceMotion={reduceMotion}
          style={primaryButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={bp("enableCta", { label: biometricLabel })}
        >
          {busy ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>
              {bp("enableCta", { label: biometricLabel })}
            </Text>
          )}
        </ScalePressable>
        <ScalePressable
          onPress={() => void onNotNow()}
          disabled={busy}
          reduceMotion={reduceMotion}
          style={outlineButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={bp("notNowCta")}
        >
          <Text style={{ color: Colors.gray[700], fontWeight: "600", fontSize: 16 }}>
            {bp("notNowCta")}
          </Text>
        </ScalePressable>
        <ScalePressable
          onPress={() => void onOpenSettings()}
          disabled={busy}
          reduceMotion={reduceMotion}
          style={{ marginTop: 14, paddingVertical: 8, alignItems: "center" }}
          accessibilityRole="link"
          accessibilityLabel={bp("settingsLink")}
        >
          <Text style={{ color: Colors.primary, fontWeight: "600", fontSize: 14 }}>
            {bp("settingsLink")}
          </Text>
        </ScalePressable>
        <Text style={{ marginTop: 12, textAlign: "center", fontSize: 13, color: Colors.gray[500], lineHeight: 18 }}>
          {bp("notNowHint")}
        </Text>
          </>
        )}
      </AnimatedPromptCard>
    </Modal>
  );
}
