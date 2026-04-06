/**
 * Portal: opens provider web path in the external browser.
 * Route: (app)/(tabs)/more/portal?path=/provider/...
 */
import { useEffect, useState } from "react";
import { View, ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getWebProviderBaseUrl } from "@/lib/web-url";
import { Colors } from "@/constants/colors";

const DEFAULT_PATH = "/provider/dashboard";

function firstString(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function PortalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ path?: string | string[]; title?: string | string[] }>();
  const rawPath = firstString(params.path);
  const pathParam = rawPath ? decodeURIComponent(rawPath) : DEFAULT_PATH;
  const path = pathParam.startsWith("/") ? pathParam : `/${pathParam}`;
  const rawTitle = firstString(params.title);
  const screenTitle = rawTitle ? decodeURIComponent(rawTitle) : null;

  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setErrorMessage(null);

    (async () => {
      const baseUrl = getWebProviderBaseUrl().replace(/\/$/, "");
      const url = `${baseUrl}${path}`;
      try {
        const can = await Linking.canOpenURL(url);
        if (cancelled) return;
        if (!can) {
          setErrorMessage("This device cannot open this link. Try again from your phone’s browser.");
          setBusy(false);
          return;
        }
        await Linking.openURL(url);
        if (cancelled) return;
        router.back();
      } catch {
        if (cancelled) return;
        setErrorMessage("We could not open the browser. Check your connection and try again.");
        setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, router, attempt]);

  const friendlyPath = path.length > 48 ? `${path.slice(0, 45)}…` : path;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={["top", "bottom"]}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }}>
        {busy ? (
          <>
            <ActivityIndicator size="large" color={Colors.primary} accessibilityLabel="Loading" />
            <Text
              style={{ marginTop: 16, fontSize: 16, fontWeight: "600", color: Colors.gray[900], textAlign: "center" }}
            >
              Opening in browser…
            </Text>
            {screenTitle ? (
              <Text style={{ marginTop: 6, fontSize: 14, color: Colors.gray[600], textAlign: "center" }}>{screenTitle}</Text>
            ) : null}
            <Text
              style={{ marginTop: 10, fontSize: 13, color: Colors.gray[500], textAlign: "center" }}
              accessibilityLabel={`Destination path ${path}`}
            >
              {friendlyPath}
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="alert-circle-outline" size={44} color={Colors.warning} accessibilityHidden />
            <Text
              style={{ marginTop: 14, fontSize: 17, fontWeight: "600", color: Colors.gray[900], textAlign: "center" }}
            >
              Could not open link
            </Text>
            <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[600], textAlign: "center", lineHeight: 20 }}>
              {errorMessage}
            </Text>
            <Text style={{ marginTop: 12, fontSize: 12, color: Colors.gray[400], textAlign: "center" }}>{friendlyPath}</Text>
            <TouchableOpacity
              onPress={() => setAttempt((a) => a + 1)}
              style={{
                marginTop: 28,
                backgroundColor: Colors.primary,
                paddingVertical: 14,
                paddingHorizontal: 32,
                borderRadius: 12,
                minWidth: 200,
                alignItems: "center",
              }}
              accessibilityRole="button"
              accessibilityLabel="Try opening link again"
            >
              <Text style={{ color: Colors.white, fontSize: 16, fontWeight: "600" }}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginTop: 14, paddingVertical: 12, paddingHorizontal: 24 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.gray[600] }}>Go back</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
