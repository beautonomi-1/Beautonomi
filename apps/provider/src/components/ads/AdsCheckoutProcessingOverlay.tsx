import { useEffect, useRef } from "react";
import { View, Text, Modal, ActivityIndicator, Animated, StyleSheet } from "react-native";
import { Colors } from "@/constants/colors";

export interface AdsCheckoutProcessingOverlayProps {
  visible: boolean;
  message?: string;
  hint?: string | null;
  /** Optional title above the message (e.g. "Confirming payment"). */
  title?: string;
}

/**
 * Full-screen blocking overlay shown while the Paystack sheet is open and while
 * we verify + poll for campaign provisioning. Mirrors the customer product
 * checkout overlay so the provider ads flow feels identical and never appears
 * frozen.
 */
export function AdsCheckoutProcessingOverlay({
  visible,
  message = "Confirming your payment…",
  hint,
  title = "Please wait",
}: AdsCheckoutProcessingOverlayProps) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop} pointerEvents="auto">
        <Animated.View style={[styles.iconWrap, { opacity: pulse }]}>
          <ActivityIndicator size="large" color={Colors.primary} style={styles.spinner} />
        </Animated.View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.hint}>
          {hint === null
            ? ""
            : hint ?? "Don't close the app — we're confirming with the payment provider."}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrap: { marginBottom: 20 },
  spinner: { transform: [{ scale: 1.15 }] },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 12,
  },
  hint: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },
});
