import { useEffect } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface SkeletonProps {
  width?: number | `${number}%` | "auto";
  height?: number;
  borderRadius?: number;
  className?: string;
  style?: ViewStyle;
}

export function Skeleton({
  width,
  height = 16,
  borderRadius = 8,
  className = "",
  style,
}: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, // infinite
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      className={`bg-gray-200 ${className}`}
      style={[
        {
          width: width ?? "100%",
          height,
          borderRadius,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/* ─── Preset skeleton patterns ─── */

export function SkeletonCard() {
  return (
    <View className="rounded-2xl border border-gray-100 bg-white p-4">
      <View className="flex-row items-center">
        <Skeleton width={44} height={44} borderRadius={12} />
        <View className="ml-3 flex-1">
          <Skeleton height={14} style={{ width: "60%" }} />
          <Skeleton height={10} style={{ width: "40%", marginTop: 6 }} />
        </View>
      </View>
    </View>
  );
}

export function SkeletonStatRow() {
  return (
    <View className="flex-row gap-3">
      {[0, 1].map((i) => (
        <View
          key={i}
          className="flex-1 rounded-2xl border border-gray-100 bg-white p-4"
        >
          <Skeleton height={10} style={{ width: "50%" }} />
          <Skeleton height={24} style={{ width: "70%", marginTop: 8 }} />
          <Skeleton height={10} style={{ width: "30%", marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

export function SkeletonDashboard() {
  return (
    <View className="px-4 pt-4" accessibilityLabel="Loading dashboard">
      <SkeletonStatRow />
      <View className="mt-4">
        <SkeletonStatRow />
      </View>
      <View className="mt-6">
        <Skeleton height={14} style={{ width: "30%", marginBottom: 12 }} />
        <Skeleton height={160} borderRadius={16} />
      </View>
      <View className="mt-6">
        <Skeleton height={14} style={{ width: "30%", marginBottom: 12 }} />
        <SkeletonList rows={3} />
      </View>
    </View>
  );
}
