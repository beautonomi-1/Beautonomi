/**
 * In-app Paystack hosted checkout for the provider app.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewNavigation } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { isCancelledPaystackUrl } from "@/lib/paystack-webview-utils";

export type PaystackWebViewModalProps = {
  visible: boolean;
  authorizationUrl: string | null;
  title?: string;
  matchSuccess: (url: string) => boolean;
  matchCancel?: (url: string) => boolean;
  onComplete: (result: { outcome: "success" | "cancel" | "closed"; url?: string }) => void;
};

export function PaystackWebViewModal({
  visible,
  authorizationUrl,
  title = "Secure payment",
  matchSuccess,
  matchCancel,
  onComplete,
}: PaystackWebViewModalProps) {
  const handledRef = useRef(false);
  const [webKey, setWebKey] = useState(0);
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    if (visible && authorizationUrl) {
      handledRef.current = false;
      setWebKey((k) => k + 1);
      setShowSlowHint(false);
    }
  }, [visible, authorizationUrl]);

  useEffect(() => {
    if (!visible || !authorizationUrl) {
      setShowSlowHint(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowSlowHint(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [visible, authorizationUrl, webKey]);

  const finish = useCallback(
    (outcome: "success" | "cancel" | "closed", url?: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      onComplete({ outcome, url });
    },
    [onComplete],
  );

  const considerUrl = useCallback(
    (url: string) => {
      if (!url || handledRef.current) return;
      const cancelFn =
        matchCancel ??
        ((u: string) => {
          try {
            return isCancelledPaystackUrl(u);
          } catch {
            return false;
          }
        });
      if (cancelFn(url)) {
        finish("cancel", url);
        return;
      }
      if (matchSuccess(url)) {
        finish("success", url);
      }
    },
    [finish, matchCancel, matchSuccess],
  );

  const onNavStateChange = useCallback(
    (nav: WebViewNavigation) => {
      considerUrl(nav.url);
    },
    [considerUrl],
  );

  const onShouldStart = useCallback(
    (req: { url: string }) => {
      const url = req.url;
      if (matchCancel?.(url) || (matchCancel == null && isCancelledPaystackUrl(url))) {
        finish("cancel", url);
        return false;
      }
      if (matchSuccess(url)) {
        finish("success", url);
        return false;
      }
      return true;
    },
    [finish, matchCancel, matchSuccess],
  );

  const closeFromUser = useCallback(() => {
    finish("closed");
  }, [finish]);

  const retryLoad = useCallback(() => {
    setShowSlowHint(false);
    setWebKey((k) => k + 1);
  }, []);

  if (Platform.OS === "web") {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeFromUser}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={closeFromUser}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Close payment"
          >
            <Ionicons name="close" size={26} color={Colors.gray[800]} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        {authorizationUrl ? (
          <WebView
            key={webKey}
            source={{ uri: authorizationUrl }}
            style={styles.webview}
            onNavigationStateChange={onNavStateChange}
            onShouldStartLoadWithRequest={onShouldStart}
            originWhitelist={["https://*", "http://*", "provider://*", "exp://*"]}
            setSupportMultipleWindows={false}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color={Colors.primary} />
                {showSlowHint ? (
                  <TouchableOpacity onPress={retryLoad} style={styles.retryWrap} accessibilityRole="button">
                    <Text style={styles.retryText}>Still opening? Tap Retry</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          />
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  iconBtn: { padding: 8 },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: Colors.gray[900] },
  webview: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  retryWrap: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.gray[100],
  },
  retryText: {
    fontSize: 12,
    color: Colors.gray[700],
    fontWeight: "600",
  },
});
