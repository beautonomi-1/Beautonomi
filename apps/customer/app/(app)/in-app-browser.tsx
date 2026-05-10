/**
 * In-app browser: loads a URL (e.g. Paystack payment, web cart) in a WebView
 * so customers never leave the app.
 * Route: (app)/in-app-browser?url=<encoded>&title=...
 */
import { useCallback, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet, Linking, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { useTranslation } from "@beautonomi/i18n";

export default function InAppBrowserScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  let rawUrl = "";
  let displayTitle = "Link";
  try { rawUrl = params.url ? decodeURIComponent(params.url) : ""; } catch { rawUrl = params.url ?? ""; }
  try { displayTitle = params.title ? decodeURIComponent(params.title) : "Link"; } catch { displayTitle = params.title ?? "Link"; }
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastWebUrl, setLastWebUrl] = useState(rawUrl);

  const pollCustomOfferBooking = useCallback(async (offerId: string) => {
    for (let i = 0; i < 15; i += 1) {
      try {
        const res = await api.get<{ booking_id?: string | null }>(`/api/me/custom-offers/${offerId}`);
        const bookingId = (res.data as { booking_id?: string | null } | undefined)?.booking_id ?? null;
        if (bookingId) {
          router.replace({ pathname: "/(app)/booking-detail", params: { id: bookingId } } as never);
          return;
        }
      } catch {
        // ignore while polling
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    Alert.alert(
      t("checkout.customOfferPollTimeoutTitle"),
      t("checkout.customOfferPollTimeoutBody"),
      [{ text: t("common.ok"), onPress: () => router.replace("/(app)/account-settings/custom-requests" as never) }],
    );
  }, [router, t]);

  const isValid =
    rawUrl.startsWith("https://") || rawUrl.startsWith("http://");

  if (!rawUrl || !isValid) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
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
          <Text style={styles.headerTitle} numberOfLines={1}>{displayTitle}</Text>
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
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
        <Text style={styles.headerTitle} numberOfLines={1}>{displayTitle}</Text>
      </View>
      <View style={styles.webviewWrap}>
        <WebView
          source={{ uri: rawUrl }}
          style={styles.webview}
          originWhitelist={["https://*", "http://*", "customer://*"]}
          onShouldStartLoadWithRequest={(request: { url: string }) => {
            const u = request.url;
            if (u.startsWith("customer://")) {
              Linking.openURL(u).catch(() => {});
              return false;
            }
            return true;
          }}
          onMessage={(e: any) => {
            try {
              const msg = JSON.parse(e.nativeEvent.data);
              const isPaymentSuccess =
                msg?.type === "checkout_success" || msg?.type === "payment_success";
              if (isPaymentSuccess) {
                const paymentType = msg?.payment_type;
                const bookingId = msg?.booking_id;
                if (bookingId) {
                  router.replace({
                    pathname: "/(app)/booking-detail",
                    params: { id: bookingId },
                  } as never);
                } else if (paymentType === "custom_offer") {
                  const offerId = (() => {
                    try {
                      const parsed = new URL(lastWebUrl);
                      return parsed.searchParams.get("offer_id");
                    } catch {
                      return null;
                    }
                  })();
                  if (offerId) {
                    void pollCustomOfferBooking(offerId);
                  } else {
                    router.replace("/(app)/account-settings/custom-requests" as never);
                  }
                } else if (paymentType === "wallet_topup") {
                  router.replace("/(app)/(tabs)/profile" as never);
                } else {
                  router.replace("/(app)/product-orders" as never);
                }
              }
            } catch {
              // ignore
            }
          }}
          onNavigationStateChange={(state) => {
            if (state?.url) setLastWebUrl(state.url);
          }}
          onError={(e: any) => setLoadError(e.nativeEvent.description || "Failed to load")}
          onHttpError={(e: any) => setLoadError(`HTTP ${e.nativeEvent.statusCode}`)}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingTitle}>Please wait</Text>
              <Text style={styles.loadingText}>Opening secure payment…{"\n"}Do not close this screen.</Text>
            </View>
          )}
        />
        {loadError ? (
          <View style={styles.loadError}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
              <Text style={styles.backLinkText}>Go back</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "600", color: Colors.gray[900] },
  webviewWrap: { flex: 1 },
  webview: { flex: 1 },
  loading: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
  },
  loadingTitle: { marginTop: 16, fontSize: 18, fontWeight: "800", color: Colors.gray[900] },
  loadingText: { marginTop: 10, fontSize: 14, fontWeight: "500", color: Colors.gray[600], textAlign: "center", paddingHorizontal: 28, lineHeight: 20 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadError: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
    padding: 24,
  },
  errorText: { textAlign: "center", color: Colors.gray[600] },
  backLink: { marginTop: 16 },
  backLinkText: { fontSize: 14, fontWeight: "500", color: Colors.primary },
});
