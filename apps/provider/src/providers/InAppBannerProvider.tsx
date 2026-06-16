/**
 * Top-anchored in-app banner for non-interruptive alerts (orders, messages).
 * Queues items when one is already visible; auto-dismisses after ~4s.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

const AUTO_DISMISS_MS = 4000;
const SLIDE_DURATION_MS = 280;

export type InAppBannerTone = "default" | "success" | "info";

export type InAppBannerRequest = {
  id?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  tone?: InAppBannerTone;
  onPress?: () => void;
  durationMs?: number;
};

type InAppBannerContextValue = {
  show: (request: InAppBannerRequest) => void;
  dismiss: () => void;
};

const InAppBannerContext = createContext<InAppBannerContextValue | null>(null);

function toneColors(tone: InAppBannerTone) {
  switch (tone) {
    case "success":
      return { bg: "#ecfdf5", border: "#a7f3d0", icon: "#059669", text: "#065f46" };
    case "info":
      return { bg: "#eff6ff", border: "#bfdbfe", icon: Colors.primary, text: "#1e3a8a" };
    default:
      return { bg: "#ffffff", border: Colors.gray[200], icon: Colors.primary, text: Colors.gray[900] };
  }
}

export function InAppBannerProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState<InAppBannerRequest | null>(null);
  const queueRef = useRef<InAppBannerRequest[]>([]);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const animateOut = useCallback(
    (onDone?: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: SLIDE_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: SLIDE_DURATION_MS,
          useNativeDriver: true,
        }),
      ]).start(() => onDone?.());
    },
    [opacity, translateY],
  );

  const showNext = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    if (!next) {
      setVisible(null);
      return;
    }
    setVisible(next);
    translateY.setValue(-120);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: SLIDE_DURATION_MS,
        useNativeDriver: true,
      }),
    ]).start();
    clearDismissTimer();
    dismissTimerRef.current = setTimeout(() => {
      animateOut(() => showNext());
    }, next.durationMs ?? AUTO_DISMISS_MS);
  }, [animateOut, clearDismissTimer, opacity, translateY]);

  const dismiss = useCallback(() => {
    clearDismissTimer();
    if (!visible) return;
    animateOut(() => showNext());
  }, [animateOut, clearDismissTimer, showNext, visible]);

  const show = useCallback(
    (request: InAppBannerRequest) => {
      const item = { ...request, id: request.id ?? `${Date.now()}-${Math.random()}` };
      if (visible) {
        queueRef.current.push(item);
        return;
      }
      queueRef.current.unshift(item);
      showNext();
    },
    [showNext, visible],
  );

  useEffect(() => () => clearDismissTimer(), [clearDismissTimer]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
        onPanResponderRelease: (_, g) => {
          if (g.dy < -24) dismiss();
        },
      }),
    [dismiss],
  );

  const ctx = useMemo(() => ({ show, dismiss }), [dismiss, show]);

  const palette = visible ? toneColors(visible.tone ?? "default") : null;

  return (
    <InAppBannerContext.Provider value={ctx}>
      {children}
      {visible && palette ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.host,
            {
              paddingTop: Math.max(insets.top, Platform.OS === "android" ? 8 : 0) + 8,
              opacity,
              transform: [{ translateY }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => {
              clearDismissTimer();
              const action = visible.onPress;
              animateOut(() => {
                setVisible(null);
                action?.();
                showNext();
              });
            }}
            style={[
              styles.banner,
              { backgroundColor: palette.bg, borderColor: palette.border },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${visible.title}. ${visible.message ?? ""}`}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${palette.icon}18` }]}>
              <Ionicons
                name={visible.icon ?? "notifications-outline"}
                size={20}
                color={palette.icon}
              />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
                {visible.title}
              </Text>
              {visible.message ? (
                <Text style={styles.message} numberOfLines={2}>
                  {visible.message}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={dismiss}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Ionicons name="close" size={20} color={Colors.gray[500]} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
    </InAppBannerContext.Provider>
  );
}

export function useInAppBanner(): InAppBannerContextValue {
  const ctx = useContext(InAppBannerContext);
  if (!ctx) {
    throw new Error("useInAppBanner must be used within InAppBannerProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: 12,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  message: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.gray[600],
    lineHeight: 18,
  },
});
