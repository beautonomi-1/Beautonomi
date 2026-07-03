/**
 * §provider-setup-seamless-ux 2026-05: one-time celebration overlay that fires
 * the moment `/api/provider/setup-status` flips `isComplete: true` for the
 * first time. After dismissal, an `AsyncStorage` flag prevents it from ever
 * showing again for this provider on this device.
 *
 * The overlay is mounted in `app/(app)/_layout.tsx` so it can appear over any
 * tab the moment the API flips — there's no requirement that the provider be
 * on a specific screen.
 *
 * Implementation notes:
 * - Uses `react-native-reanimated` (already a dep) for confetti + scale-in
 *   animation. Falls back gracefully if reanimated worklets aren't available.
 * - Keeps confetti count low (24 pieces) so the burst is celebratory but not
 *   distracting on lower-end Android devices.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
  Dimensions,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { setSetupCelebrationVisible } from "@/lib/setup-celebration-gate";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/providers/AuthProvider";
import { useProvider } from "@/providers/ProviderContext";
import { Colors } from "@/constants/colors";

const STORAGE_KEY_PREFIX = "provider:setup_celebration_shown_v1:";

type SetupStatusLite = {
  isComplete: boolean;
  completionPercentage: number;
};

const CONFETTI_COLORS = [
  "#ec4899", // primary pink
  "#f97316", // orange
  "#facc15", // amber
  "#22c55e", // emerald
  "#3b82f6", // blue
  "#a855f7", // violet
];

const CONFETTI_COUNT = 24;

function ConfettiPiece({ index, total }: { index: number; total: number }) {
  const progress = useSharedValue(0);
  const dims = Dimensions.get("window");

  const config = useMemo(() => {
    const seed = (index + 1) / total;
    const angle = (index / total) * Math.PI * 2;
    const radius = dims.width * 0.4 + (seed * dims.width * 0.2);
    return {
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? "#ec4899",
      dx: Math.cos(angle) * radius,
      dy: Math.sin(angle) * radius + dims.height * 0.1,
      rotation: (seed * 360 + index * 17) % 360,
      delay: (index % 6) * 35,
      size: 8 + (index % 3) * 3,
    };
  }, [index, total, dims.width, dims.height]);

  useEffect(() => {
    progress.value = withDelay(
      config.delay,
      withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }),
    );
  }, [progress, config.delay]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15,
      transform: [
        { translateX: config.dx * p },
        { translateY: config.dy * p },
        { rotate: `${config.rotation * p}deg` },
        { scale: 0.6 + p * 0.6 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.confetti,
        {
          backgroundColor: config.color,
          width: config.size,
          height: config.size,
        },
        animatedStyle,
      ]}
    />
  );
}

export function SetupCompleteCelebration() {
  const router = useRouter();
  const { user } = useAuth();
  const { provider } = useProvider();
  const isPendingApproval = provider?.status === "pending_approval";
  // Reads the same cache key as every other setup-status consumer.
  const { data } = useApi<SetupStatusLite>("/api/provider/setup-status");
  const [visible, setVisible] = useState(false);
  const flaggedShown = useRef(false);

  const storageKey = useMemo(
    () => (user?.id ? `${STORAGE_KEY_PREFIX}${user.id}` : null),
    [user?.id],
  );

  useEffect(() => {
    if (!data?.isComplete) return;
    if (!storageKey) return;
    if (flaggedShown.current) return;
    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(storageKey);
        if (cancelled) return;
        if (seen === "1") {
          flaggedShown.current = true;
          return;
        }
        flaggedShown.current = true;
        setVisible(true);
        await AsyncStorage.setItem(storageKey, "1");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Ignore AsyncStorage failures — celebration is best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.isComplete, storageKey]);

  const cardScale = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      cardOpacity.value = withTiming(1, { duration: 220 });
      cardScale.value = withTiming(1, {
        duration: 260,
        easing: Easing.out(Easing.back(1.6)),
      });
    } else {
      cardOpacity.value = 0;
      cardScale.value = 0.9;
    }
  }, [visible, cardOpacity, cardScale]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  useEffect(() => {
    setSetupCelebrationVisible(visible);
    return () => {
      if (visible) setSetupCelebrationVisible(false);
    };
  }, [visible]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setSetupCelebrationVisible(false);
  }, []);

  const handleDashboard = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisible(false);
    setSetupCelebrationVisible(false);
    router.push("/(app)/(tabs)/dashboard" as never);
  }, [router]);

  const handleMore = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisible(false);
    setSetupCelebrationVisible(false);
    router.push("/(app)/(tabs)/more/gallery" as never);
  }, [router]);

  if (!visible) return null;

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={dismiss}
    >
      <Pressable onPress={dismiss} style={styles.backdrop} accessibilityRole="button" accessibilityLabel="Dismiss celebration">
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
            <ConfettiPiece key={i} index={i} total={CONFETTI_COUNT} />
          ))}
        </View>
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.iconWrap}>
            <Ionicons
              name={isPendingApproval ? "hourglass-outline" : "trophy"}
              size={36}
              color={isPendingApproval ? "#d97706" : "#ec4899"}
            />
          </View>
          <Text style={styles.title}>
            {isPendingApproval ? "Profile submitted!" : "You\u2019re all set!"}
          </Text>
          <Text style={styles.subtitle}>
            {isPendingApproval
              ? "Your profile is under review. We\u2019ll notify you once it\u2019s approved and visible to customers. While you wait, you can finish setting up your profile."
              : "Your business is ready to accept bookings on Beautonomi. Time to grow."}
          </Text>
          <TouchableOpacity
            onPress={handleDashboard}
            activeOpacity={0.85}
            style={styles.primaryBtn}
            accessibilityRole="button"
            accessibilityLabel="Continue to dashboard"
          >
            <Text style={styles.primaryLabel}>
              {isPendingApproval ? "Go to dashboard" : "Continue to dashboard"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleMore}
            activeOpacity={0.7}
            style={styles.secondaryBtn}
            accessibilityRole="button"
            accessibilityLabel="Add more details like gallery or identity verification"
          >
            <Text style={styles.secondaryLabel}>
              {isPendingApproval
                ? "Complete your profile (gallery, KYC)"
                : "Add more details (gallery, KYC)"}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  confetti: {
    position: "absolute",
    top: "50%",
    left: "50%",
    borderRadius: 2,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fdf2f8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#fbcfe8",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#4b5563",
    textAlign: "center",
  },
  primaryBtn: {
    marginTop: 22,
    width: "100%",
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  secondaryLabel: {
    color: Colors.gray[600],
    fontSize: 13,
    fontWeight: "500",
  },
});
