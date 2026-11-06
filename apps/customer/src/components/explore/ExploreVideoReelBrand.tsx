import { useEffect, useRef } from "react";
import { Animated, View, type ViewStyle } from "react-native";
import { BeautonomiLogo } from "@/components/ui/BeautonomiLogo";

const END_MARK_FADE_MS = 1200;

type SideLogoProps = {
  spinning: boolean;
  style?: ViewStyle;
};

/** TikTok-style round mark beside reel actions; spins only while the clip is playing. */
export function ExploreVideoReelSideLogo({ spinning, style }: SideLogoProps) {
  const rot = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!spinning) {
      loopRef.current?.stop();
      rot.setValue(0);
      return;
    }
    rot.setValue(0);
    loopRef.current = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 9000, useNativeDriver: true }),
    );
    loopRef.current.start();
    return () => loopRef.current?.stop();
  }, [rot, spinning]);

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View
      style={[
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "rgba(0,0,0,0.45)",
          alignItems: "center",
          justifyContent: "center",
          transform: [{ rotate }],
        },
        style,
      ]}
    >
      <BeautonomiLogo size={22} color="#fff" />
    </Animated.View>
  );
}

type EndMarkProps = {
  /** 0–1 progress through the active clip; end mark fades in during the last ~1.2s. */
  progress: number;
  durationMs: number;
};

export function ExploreVideoReelEndMark({ progress, durationMs }: EndMarkProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const nearEnd =
      durationMs > 0 && progress >= Math.max(0, 1 - END_MARK_FADE_MS / durationMs);
    Animated.timing(opacity, {
      toValue: nearEnd ? 1 : 0,
      duration: nearEnd ? 280 : 120,
      useNativeDriver: true,
    }).start();
  }, [durationMs, opacity, progress]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        inset: 0,
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: "rgba(0,0,0,0.55)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BeautonomiLogo size={36} color="#fff" />
      </View>
    </Animated.View>
  );
}
