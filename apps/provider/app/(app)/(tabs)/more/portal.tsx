/**
 * Portal: loads a provider web path in the in-app WebView.
 * Route: (app)/(tabs)/more/portal?path=/provider/...&title=...
 */
import { useEffect } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { getWebProviderBaseUrl } from "@/lib/web-url";
import { replaceInAppBrowser } from "@/lib/in-app-web";
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
  const screenTitle = rawTitle ? decodeURIComponent(rawTitle) : "Portal";

  useEffect(() => {
    const baseUrl = getWebProviderBaseUrl().replace(/\/$/, "");
    const url = `${baseUrl}${path}`;
    replaceInAppBrowser(router, url, screenTitle);
  }, [path, router, screenTitle]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={["top", "bottom"]}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 16, fontSize: 14, color: Colors.gray[600], textAlign: "center" }}>
          Opening…
        </Text>
      </View>
    </SafeAreaView>
  );
}
