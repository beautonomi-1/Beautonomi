/**
 * First-session native setup: push notifications only.
 * Location and photos are requested in-context when the user starts those flows.
 */
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { useAuth } from "@/providers/AuthProvider";
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";
import { Colors } from "@/constants/colors";
import {
  openAppNotificationSettings,
  showPermissionRecoveryAlert,
} from "@/lib/native-permissions";
import {
  ensureOneSignalInitialized,
  requestOneSignalPushPermission,
  resolveOneSignalAppId,
} from "@/lib/onesignal-client";
import { ONE_SIGNAL_APP_ID } from "@/config/public-env";

const STEPS = ["welcome", "notifications"] as const;

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

function AnimatedProgressBar({ progress, reduceMotion }: { progress: number; reduceMotion: boolean }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    const target = (progress / 100) * trackWidth;
    fillWidth.value = reduceMotion ? target : withSpring(target, { damping: 22, stiffness: 140 });
  }, [fillWidth, progress, reduceMotion, trackWidth]);

  const fillStyle = useAnimatedStyle(() => ({
    width: fillWidth.value,
  }));

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={{
        height: 6,
        backgroundColor: Colors.gray[100],
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          {
            height: "100%",
            backgroundColor: Colors.primary,
            borderRadius: 999,
          },
          fillStyle,
        ]}
      />
    </View>
  );
}

function AnimatedStepPanel({
  stepKey,
  reduceMotion,
  children,
}: {
  stepKey: string;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateX = useSharedValue(reduceMotion ? 0 : 24);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateX.value = 0;
      return;
    }
    opacity.value = 0;
    translateX.value = 24;
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    translateX.value = withSpring(0, { damping: 22, stiffness: 170 });
  }, [opacity, reduceMotion, stepKey, translateX]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}

function AnimatedIllustration({
  stepKey,
  reduceMotion,
  children,
}: {
  stepKey: string;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  const scale = useSharedValue(reduceMotion ? 1 : 0.72);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    scale.value = 0.72;
    opacity.value = 0;
    scale.value = withSpring(1, { damping: 14, stiffness: 150 });
    opacity.value = withTiming(1, { duration: 280 });
  }, [opacity, reduceMotion, scale, stepKey]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
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

function IllustrationFrame({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        width: 132,
        height: 132,
        borderRadius: 32,
        backgroundColor: Colors.primaryLight,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 28,
      }}
    >
      {children}
    </View>
  );
}

function WelcomeIllustration() {
  return (
    <Svg width={88} height={88} viewBox="0 0 88 88" fill="none">
      <Circle cx="44" cy="44" r="36" fill={Colors.primary} opacity={0.12} />
      <Path
        d="M44 18L54 24V40C54 50.5 44 58 44 58C44 58 34 50.5 34 40V24L44 18Z"
        fill={Colors.primary}
        opacity={0.9}
      />
      <Path
        d="M40 42L43 45L50 36"
        stroke={Colors.white}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="24" cy="26" r="3" fill={Colors.primary} opacity={0.5} />
      <Circle cx="66" cy="30" r="2.5" fill={Colors.primary} opacity={0.4} />
      <Circle cx="62" cy="58" r="2" fill={Colors.primary} opacity={0.35} />
    </Svg>
  );
}

function BellIllustration() {
  return (
    <Svg width={88} height={88} viewBox="0 0 88 88" fill="none">
      <Path
        d="M18 58C18 58 22 52 22 42V34C22 24.5 30 18 44 18C58 18 66 24.5 66 34V42C66 52 70 58 70 58"
        stroke={Colors.primary}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <Path d="M30 58H58" stroke={Colors.primary} strokeWidth={3.5} strokeLinecap="round" />
      <Path
        d="M38 62C38 66 40.5 70 44 70C47.5 70 50 66 50 62"
        stroke={Colors.primary}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle cx="44" cy="30" r="4" fill={Colors.primary} opacity={0.25} />
      <Path d="M10 36C12 34 14 38 12 40" stroke={Colors.primary} strokeWidth={2} strokeLinecap="round" opacity={0.45} />
      <Path d="M78 36C76 34 74 38 76 40" stroke={Colors.primary} strokeWidth={2} strokeLinecap="round" opacity={0.45} />
    </Svg>
  );
}

function BenefitRow({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: Colors.primaryLight,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="checkmark" size={16} color={Colors.primary} />
      </View>
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 22, color: Colors.gray[700] }}>{text}</Text>
    </View>
  );
}

function StepHeader({
  stepIndex,
  title,
  body,
  illustration,
  stepKey,
  reduceMotion,
}: {
  stepIndex: number;
  title: string;
  body: string;
  illustration: ReactNode;
  stepKey: string;
  reduceMotion: boolean;
}) {
  return (
    <>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: Colors.gray[400],
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginBottom: 20,
        }}
      >
        Step {stepIndex + 1} of {STEPS.length}
      </Text>
      <AnimatedIllustration stepKey={stepKey} reduceMotion={reduceMotion}>
        <IllustrationFrame>{illustration}</IllustrationFrame>
      </AnimatedIllustration>
      <Text style={{ fontSize: 28, fontWeight: "700", color: Colors.gray[900], marginBottom: 12, letterSpacing: -0.3 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 26, color: Colors.gray[600] }}>{body}</Text>
    </>
  );
}

async function requestOneSignalPush(userId: string): Promise<void> {
  try {
    const appId = (await resolveOneSignalAppId()) || ONE_SIGNAL_APP_ID || "";
    if (!appId) return;
    await ensureOneSignalInitialized(appId, userId);
    const accepted = await requestOneSignalPushPermission(true);
    if (!accepted) {
      await showPermissionRecoveryAlert(
        {
          title: "Notifications are off",
          message: "Turn on notifications in Settings to receive bookings, messages, payout updates, and urgent alerts.",
        },
        { openSettings: openAppNotificationSettings },
      );
    }
  } catch {
    // Expo Go / missing native module
  }
}

export function NativePermissionsOnboarding() {
  const insets = useSafeAreaInsets();
  const { session, user } = useAuth();
  const { gate, markOnboardingFinished } = useNativePermissionsOnboardingGate();
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const reduceMotion = useReduceMotion();

  const visible =
    Platform.OS !== "web" && gate.phase === "needs_onboarding" && !!session?.access_token;

  useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible]);

  const finish = useCallback(async () => {
    setBusy(true);
    try {
      await markOnboardingFinished();
    } finally {
      setBusy(false);
    }
  }, [markOnboardingFinished]);

  const goNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, []);

  const onContinueNotifications = useCallback(async () => {
    setBusy(true);
    try {
      if (user?.id) await requestOneSignalPush(user.id);
    } finally {
      setBusy(false);
      await finish();
    }
  }, [finish, user?.id]);

  if (!visible) return null;

  const step = STEPS[stepIndex];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const primaryButtonStyle = {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center" as const,
    minHeight: 54,
    justifyContent: "center" as const,
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => {}}>
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.white,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 20,
          paddingHorizontal: 28,
        }}
      >
        <AnimatedProgressBar progress={progress} reduceMotion={reduceMotion} />

        <AnimatedStepPanel stepKey={step} reduceMotion={reduceMotion}>
          {step === "welcome" && (
            <View style={{ flex: 1, paddingTop: 28 }}>
              <StepHeader
                stepIndex={stepIndex}
                stepKey={step}
                reduceMotion={reduceMotion}
                illustration={<WelcomeIllustration />}
                title="Set up Beautonomi Provider"
                body="Turn on notifications so you never miss bookings, messages, and payout updates. Location and photo access are requested later when you use those features."
              />
              <View style={{ marginTop: 28 }}>
                <BenefitRow text="New bookings, on-demand requests, and messages" />
                <BenefitRow text="Payout and time-sensitive alerts" />
              </View>
            </View>
          )}

          {step === "notifications" && (
            <View style={{ flex: 1, paddingTop: 28 }}>
              <StepHeader
                stepIndex={stepIndex}
                stepKey={step}
                reduceMotion={reduceMotion}
                illustration={<BellIllustration />}
                title="Don’t miss a booking"
                body="Notifications alert you to new bookings, on-demand requests, client messages, payouts, and time-sensitive updates."
              />
            </View>
          )}
        </AnimatedStepPanel>

        <View style={{ gap: 10, marginTop: 12 }}>
          {step === "welcome" && (
            <ScalePressable
              onPress={goNext}
              disabled={busy}
              reduceMotion={reduceMotion}
              style={primaryButtonStyle}
              accessibilityRole="button"
              accessibilityLabel="Continue setup"
            >
              <Text style={{ color: Colors.white, fontSize: 17, fontWeight: "600" }}>Continue</Text>
            </ScalePressable>
          )}

          {step === "notifications" && (
            <ScalePressable
              onPress={() => void onContinueNotifications()}
              disabled={busy}
              reduceMotion={reduceMotion}
              style={primaryButtonStyle}
              accessibilityRole="button"
              accessibilityLabel="Continue"
            >
              {busy ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={{ color: Colors.white, fontSize: 17, fontWeight: "600" }}>Continue</Text>
              )}
            </ScalePressable>
          )}
        </View>
      </View>
    </Modal>
  );
}
