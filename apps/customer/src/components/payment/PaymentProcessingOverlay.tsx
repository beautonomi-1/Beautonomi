import { useEffect, useState } from "react";
import { View, Text, Modal, StyleSheet } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Colors } from "@/constants/colors";
import { BrandGlyphPulse } from "@/components/BrandGlyphPulse";
import { useTranslation } from "@beautonomi/i18n";

export interface PaymentProcessingOverlayProps {
  visible: boolean;
  message?: string;
  /** Override default bank-confirmation hint (e.g. order placement, opening browser). */
  hint?: string | null;
  /** Optional 1–3 step progress (Reserve / Pay / Confirm). Omitted = legacy single-stage UI. */
  step?: 1 | 2 | 3;
}

const STEP_KEYS = ["checkout.stepReserve", "checkout.stepPay", "checkout.stepConfirm"] as const;
const STEP_DEFAULTS = ["Reserve", "Pay", "Confirm"] as const;

/**
 * Full-screen blocking overlay while Paystack / server confirmation runs.
 * Keeps users from assuming the app froze when only the primary button showed a spinner.
 */
export function PaymentProcessingOverlay({
  visible,
  message = "Processing payment…",
  hint,
  step,
}: PaymentProcessingOverlayProps) {
  const { t } = useTranslation();
  const [showSlowPath, setShowSlowPath] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowSlowPath(false);
      return;
    }
    setShowSlowPath(false);
    const timer = setTimeout(() => setShowSlowPath(true), 8000);
    return () => clearTimeout(timer);
  }, [visible, message, step]);

  const stepLabels = STEP_KEYS.map((key, i) => t(key, STEP_DEFAULTS[i]) as string);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop} pointerEvents="auto">
        <BrandGlyphPulse size={64} accentColor={Colors.primary} cardBackgroundColor="rgba(255,255,255,0.12)" />

        <Text style={styles.title}>Please wait</Text>

        <Animated.Text
          key={message}
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(180)}
          style={styles.message}
        >
          {message}
        </Animated.Text>

        {step != null ? (
          <View style={styles.stepsWrap} accessibilityRole="progressbar">
            <View style={styles.stepBar}>
              {[1, 2, 3].map((n) => (
                <View
                  key={n}
                  style={[
                    styles.stepSegment,
                    n <= step ? styles.stepSegmentActive : styles.stepSegmentInactive,
                    n < 3 && styles.stepSegmentGap,
                  ]}
                />
              ))}
            </View>
            <View style={styles.stepLabels}>
              {stepLabels.map((label, i) => (
                <Text
                  key={STEP_KEYS[i]}
                  style={[
                    styles.stepLabel,
                    i + 1 === step ? styles.stepLabelActive : styles.stepLabelInactive,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        {hint !== null ? (
          <Text style={styles.hint}>
            {hint ?? "Do not close the app — we are confirming with your bank."}
          </Text>
        ) : null}

        {showSlowPath ? (
          <Animated.Text
            entering={FadeIn.duration(400)}
            style={styles.slowPath}
          >
            {t("checkout.stillWorking", "Still working — don't close the app.")}
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
  stepsWrap: {
    width: "100%",
    maxWidth: 280,
    marginBottom: 12,
  },
  stepBar: {
    flexDirection: "row",
    marginBottom: 8,
  },
  stepSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  stepSegmentGap: {
    marginRight: 6,
  },
  stepSegmentActive: {
    backgroundColor: Colors.primary,
  },
  stepSegmentInactive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  stepLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stepLabel: {
    flex: 1,
    fontSize: 11,
    textAlign: "center",
  },
  stepLabelActive: {
    color: "#fff",
    fontWeight: "700",
  },
  stepLabelInactive: {
    color: "rgba(255,255,255,0.55)",
    fontWeight: "500",
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
