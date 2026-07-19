import { useEffect, useState } from "react";
import { View, Text, Modal, StyleSheet } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Colors } from "@/constants/colors";
import { BrandGlyphPulse } from "@/components/BrandGlyphPulse";

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
  const [showSlowPath, setShowSlowPath] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowSlowPath(false);
      return;
    }
    setShowSlowPath(false);
    const timer = setTimeout(() => setShowSlowPath(true), 8000);
    return () => clearTimeout(timer);
  }, [visible, message]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop} pointerEvents="auto">
        <BrandGlyphPulse size={64} accentColor={Colors.primary} cardBackgroundColor="rgba(255,255,255,0.12)" />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.hint}>
          {hint === null
            ? ""
            : hint ?? "Don\u2019t close the app — we\u2019re confirming with the payment provider."}
        </Text>
        {showSlowPath ? (
          <Animated.Text entering={FadeIn.duration(400)} style={styles.slowPath}>
            Still working — don{"'"}t close the app.
          </Animated.Text>
        ) : null}
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
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    marginTop: 20,
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
  slowPath: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
    marginTop: 8,
    fontWeight: "600",
  },
});
