/**
 * In-app WebView for provider dashboard / payment / receipt URLs.
 * Route: (app)/(tabs)/more/in-app-browser?url=<encoded>&title=<encoded>
 */
import { useCallback, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";

export default function InAppBrowserScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; title?: string; returnTo?: string }>();
  const rawUrl = params.url ? decodeURIComponent(params.url) : "";
  const displayTitle = params.title ? decodeURIComponent(params.title) : "Web";
  // Optional post-success destination passed by the caller (e.g. the onboarding
  // wizard sends "verify-identity" so a paid checkout lands on the optional
  // identity step rather than straight on the dashboard).
  const screenReturnTo = typeof params.returnTo === "string" ? params.returnTo : undefined;

  const [error, setError] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<{
    status: "success" | "pending" | "failed";
    title: string;
    message: string;
    returnToDashboard?: boolean;
    /** Optional post-success destination, e.g. "verify-identity". */
    returnTo?: string;
  } | null>(null);

  const onWebMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const raw = JSON.parse(e.nativeEvent.data) as {
        type?: string;
        status?: string;
        message?: string;
        return_to?: string;
      };
      // Ads budget: `/provider/settings/ads/payment-return` posts BEAUTONOMI_ADS_PAYMENT_DONE.
      // Provider subscription / renew / initialize-payment: Paystack callback lands on
      // `/provider/subscription?payment_success=true&in_app=1`, which posts subscription status
      // (see apps/web `provider/subscription/page.tsx`) so the shell can pop back to native UI.
      if (raw?.type === "BEAUTONOMI_ADS_PAYMENT_DONE") {
        const isCancelled = raw.status === "cancelled";
        const status: "success" | "pending" | "failed" =
          raw.status === "pending"
            ? "pending"
            : raw.status === "failed" || isCancelled
              ? "failed"
              : "success";
        Haptics.notificationAsync(
          status === "failed"
            ? Haptics.NotificationFeedbackType.Error
            : status === "pending"
              ? Haptics.NotificationFeedbackType.Warning
              : Haptics.NotificationFeedbackType.Success
        );
        setPaymentResult({
          status,
          title:
            status === "success"
              ? "Ad payment complete"
              : status === "pending"
                ? "Payment is syncing"
                : isCancelled
                  ? "Payment cancelled"
                  : "Payment not completed",
          message:
            raw.message ||
            (status === "success"
              ? "Your campaign payment was confirmed. Return to Ads to see the campaign update."
              : status === "pending"
                ? "Paystack received the payment, but confirmation is still syncing. Return to Ads and pull to refresh in a moment."
                : isCancelled
                  ? "You cancelled the payment. No charge was made. You can try again from your Ads dashboard."
                  : "The payment could not be confirmed. Return to Ads and try again."),
        });
        return;
      }
      if (raw?.type === "subscription_success") {
        // Prefer the caller-supplied screen destination (e.g. onboarding's
        // "verify-identity") over the web-echoed return_to.
        const returnTo = screenReturnTo ?? raw.return_to;
        const returnToVerify = returnTo === "verify-identity";
        const returnToDashboard = returnTo === "dashboard" || returnToVerify;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPaymentResult({
          status: "success",
          title: returnToDashboard ? "You're ready to launch" : "Subscription payment complete",
          message: returnToVerify
            ? "Your plan payment was confirmed. Next, verify your identity (optional) or skip to your dashboard."
            : returnToDashboard
              ? "Your plan payment was confirmed. Continue to your provider dashboard."
              : "Your plan payment was confirmed. Return to Subscription to see your active plan.",
          returnToDashboard,
          returnTo,
        });
        return;
      }
      if (raw?.type === "subscription_failed") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setPaymentResult({
          status: "failed",
          title: "Payment not completed",
          message:
            "The subscription payment did not go through. Check your card funds or try another payment method.",
        });
        return;
      }
      if (raw?.type === "subscription_pending") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setPaymentResult({
          status: "pending",
          title: "Payment is syncing",
          message:
            raw.message ||
            "Paystack received the payment, but the confirmation is still syncing with your bank. Return to Subscription and pull to refresh in a moment.",
        });
        return;
      }
      if (raw?.type === "subscription_cancelled") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setPaymentResult({
          status: "failed",
          title: "Payment cancelled",
          message: "You cancelled the payment. No charge was made.",
        });
      }
    } catch {
      // ignore non-JSON messages
    }
  }, [screenReturnTo]);

  const isValid = rawUrl.startsWith("https://") || rawUrl.startsWith("http://");

  const openExternally = useCallback(() => {
    if (!rawUrl || !isValid) return;
    Linking.openURL(rawUrl).catch(() => {});
  }, [rawUrl, isValid]);

  if (!rawUrl || !isValid) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.backBtn}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayTitle}
          </Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Invalid or missing link.</Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Expo web: no native WebView parity for all flows; open system browser.
  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.backBtn}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayTitle}
          </Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            Opening in browser (web preview). Use the iOS or Android app for an in-app view.
          </Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openExternally();
            }}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>Open link</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {displayTitle}
        </Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            openExternally();
          }}
          style={styles.openExternalBtn}
          accessibilityLabel="Open in external browser"
          accessibilityRole="button"
        >
          <Ionicons name="open-outline" size={22} color={Colors.gray[600]} />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => {
              setError(null);
            }}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : paymentResult ? (
        <LinearGradient
          colors={
            paymentResult.status === "failed"
              ? ["#fff1f2", "#ffffff", "#fff7ed"]
              : paymentResult.status === "pending"
                ? ["#fffbeb", "#ffffff", "#fff7ed"]
                : ["#f0fdf4", "#ffffff", "#fdf2f8"]
          }
          style={styles.resultShell}
        >
          <View style={styles.resultCard}>
            <View
              style={[
                styles.resultIcon,
                paymentResult.status === "failed"
                  ? styles.resultIconFailed
                  : paymentResult.status === "pending"
                    ? styles.resultIconPending
                    : styles.resultIconSuccess,
              ]}
            >
              <Ionicons
                name={
                  paymentResult.status === "failed"
                    ? "close"
                    : paymentResult.status === "pending"
                      ? "time-outline"
                      : "checkmark"
                }
                size={34}
                color={Colors.white}
              />
            </View>
            <Text style={styles.resultEyebrow}>
              {paymentResult.status === "success"
                ? "Confirmed by Paystack"
                : paymentResult.status === "pending"
                  ? "Awaiting final sync"
                  : "Action needed"}
            </Text>
            <Text style={styles.resultTitle}>{paymentResult.title}</Text>
            <Text style={styles.resultMessage}>{paymentResult.message}</Text>
            <View style={styles.resultDivider} />
            <View style={styles.resultStepRow}>
              <Ionicons name="shield-checkmark-outline" size={18} color={Colors.gray[500]} />
              <Text style={styles.resultStepText}>
                Payments are verified server-side before campaigns or plans are activated.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (paymentResult.status === "success") {
                  if (paymentResult.returnTo === "verify-identity") {
                    router.replace("/(app)/onboarding/verify-identity" as never);
                    return;
                  }
                  if (paymentResult.returnToDashboard) {
                    router.replace("/(app)/(tabs)/dashboard" as never);
                    return;
                  }
                }
                router.back();
              }}
              style={styles.resultButton}
              accessibilityLabel="Return to app"
              accessibilityRole="button"
            >
              <Text style={styles.resultButtonText}>
                {paymentResult.returnTo === "verify-identity" && paymentResult.status === "success"
                  ? "Continue"
                  : paymentResult.returnToDashboard && paymentResult.status === "success"
                    ? "Go to dashboard"
                    : "Return to app"}
              </Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      ) : (
        <WebView
          source={{ uri: rawUrl }}
          style={styles.webview}
          originWhitelist={["https://*", "http://*", "provider://*"]}
          onShouldStartLoadWithRequest={(request: { url: string }) => {
            const u = request.url;
            if (u.startsWith("provider://")) {
              Linking.openURL(u).catch(() => {});
              return false;
            }
            return true;
          }}
          onMessage={onWebMessage}
          onError={() => {
            setError("Could not load this page.");
          }}
          onHttpError={() => {
            setError("This page returned an error.");
          }}
          startInLoadingState
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          renderLoading={() => (
            <View style={styles.webviewLoading}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  webview: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  backBtn: { padding: 8, marginRight: 4 },
  openExternalBtn: { padding: 8, marginLeft: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: Colors.gray[900],
  },
  webviewLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: { textAlign: "center", color: Colors.gray[600] },
  backLink: { marginTop: 16 },
  backLinkText: { fontSize: 14, fontWeight: "500", color: Colors.primary },
  resultShell: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  resultCard: {
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,24,39,0.08)",
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: "center",
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 8,
  },
  resultIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  resultIconSuccess: { backgroundColor: "#16a34a" },
  resultIconPending: { backgroundColor: "#f59e0b" },
  resultIconFailed: { backgroundColor: "#dc2626" },
  resultEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textAlign: "center",
    marginBottom: 8,
  },
  resultTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: Colors.gray[900],
    textAlign: "center",
  },
  resultMessage: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.gray[600],
    textAlign: "center",
  },
  resultDivider: {
    width: "100%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.gray[200],
    marginVertical: 18,
  },
  resultStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 16,
    backgroundColor: Colors.gray[50],
    padding: 12,
  },
  resultStepText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.gray[600],
  },
  resultButton: {
    marginTop: 24,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    width: "100%",
  },
  resultButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
});
