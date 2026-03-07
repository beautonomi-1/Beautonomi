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
  style?: ViewStyle;
}

export function Skeleton({
  width,
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        { width: width ?? "100%", height, borderRadius, backgroundColor: "#e5e7eb" },
        animatedStyle,
        style,
      ]}
    />
  );
}

/* ─── Preset skeleton patterns ─── */

export function SkeletonCard() {
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: "#f3f4f6", backgroundColor: "#fff", padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Skeleton width={44} height={44} borderRadius={12} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Skeleton height={14} style={{ width: "60%" }} />
          <Skeleton height={10} style={{ width: "40%", marginTop: 6 }} />
        </View>
      </View>
    </View>
  );
}

export function SkeletonStatRow() {
  return (
    <View style={{ flexDirection: "row" }}>
      {[0, 1].map((i) => (
        <View key={i} style={{ flex: 1, marginRight: i === 0 ? 12 : 0, borderRadius: 16, borderWidth: 1, borderColor: "#f3f4f6", backgroundColor: "#fff", padding: 16 }}>
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
    <View>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ marginTop: i === 0 ? 0 : 12 }}>
          <SkeletonCard />
        </View>
      ))}
    </View>
  );
}

export function SkeletonDashboard() {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16 }} accessibilityLabel="Loading dashboard">
      <SkeletonStatRow />
      <View style={{ marginTop: 16 }}>
        <SkeletonStatRow />
      </View>
      <View style={{ marginTop: 24 }}>
        <Skeleton height={14} style={{ width: "30%", marginBottom: 12 }} />
        <Skeleton height={160} borderRadius={16} />
      </View>
      <View style={{ marginTop: 24 }}>
        <Skeleton height={14} style={{ width: "30%", marginBottom: 12 }} />
        <SkeletonList rows={3} />
      </View>
    </View>
  );
}
