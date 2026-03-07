import { useEffect, useRef } from "react";
import { View, Animated, Platform, type ViewStyle } from "react-native";
import { Colors } from "@/constants/colors";

const useNativeDriver = Platform.OS !== "web";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * A shimmer skeleton placeholder for loading states.
 * Pulses opacity to indicate content is loading.
 */
export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading content"
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: "#e5e7eb",
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Pre-built skeleton for a provider card */
export function ProviderCardSkeleton() {
  return (
    <View
      style={{ borderRadius: 16, overflow: "hidden", backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[100] }}
      accessibilityLabel="Loading provider"
    >
      <Skeleton width="100%" height={160} borderRadius={0} />
      <View style={{ padding: 12 }}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
        <View style={{ flexDirection: "row", marginTop: 12 }}>
          <Skeleton width={60} height={12} />
          <Skeleton width={80} height={12} style={{ marginLeft: 8 }} />
        </View>
      </View>
    </View>
  );
}

/** Pre-built skeleton for a booking card */
export function BookingCardSkeleton() {
  return (
    <View
      style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.gray[100] }}
      accessibilityLabel="Loading booking"
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
        <Skeleton width="50%" height={16} />
        <Skeleton width={70} height={22} borderRadius={12} />
      </View>
      <Skeleton width="80%" height={12} />
      <Skeleton width="60%" height={12} style={{ marginTop: 6 }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
        <Skeleton width="30%" height={12} />
        <Skeleton width={100} height={36} borderRadius={8} />
      </View>
    </View>
  );
}

/** Pre-built skeleton for an explore post card (masonry-style with varied heights) */
export function ExplorePostSkeleton({ width, heightRatio = 1.1 }: { width: number; heightRatio?: number }) {
  return (
    <View
      style={{ width, borderRadius: 16, overflow: "hidden", backgroundColor: "#F3F4F6" }}
      accessibilityLabel="Loading post"
    >
      <Skeleton width={width} height={width * heightRatio} borderRadius={0} />
      <View style={{ padding: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Skeleton width={20} height={20} borderRadius={10} />
          <Skeleton width="50%" height={11} style={{ marginLeft: 6 }} />
        </View>
        <Skeleton width="80%" height={11} style={{ marginTop: 6 }} />
        <View style={{ flexDirection: "row", marginTop: 8 }}>
          <Skeleton width={32} height={10} />
          <Skeleton width={28} height={10} style={{ marginLeft: 10 }} />
        </View>
      </View>
    </View>
  );
}

/** Pre-built skeleton for a conversation row */
export function ConversationSkeleton() {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}
      accessibilityLabel="Loading conversation"
    >
      <Skeleton width={48} height={48} borderRadius={24} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Skeleton width="50%" height={14} />
        <Skeleton width="80%" height={12} style={{ marginTop: 8 }} />
      </View>
      <Skeleton width={40} height={10} />
    </View>
  );
}

/** Pre-built skeleton for the home screen */
export function HomeSkeleton() {
  return (
    <View style={{ padding: 16 }} accessibilityLabel="Loading home screen">
      <Skeleton width="40%" height={20} />
      <View style={{ flexDirection: "row", marginTop: 24 }}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={{ width: 200, marginRight: 16 }}>
            <ProviderCardSkeleton />
          </View>
        ))}
      </View>
      <Skeleton width="50%" height={20} style={{ marginTop: 24 }} />
      <View style={{ flexDirection: "row", marginTop: 16 }}>
        {[4, 5, 6].map((i) => (
          <View key={i} style={{ width: 200, marginRight: 16 }}>
            <ProviderCardSkeleton />
          </View>
        ))}
      </View>
    </View>
  );
}
