/**
 * Portal: opens provider web path in the external browser.
 * Route: (app)/(tabs)/more/portal?path=/provider/...
 */
import { useEffect, useRef } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import * as Linking from "expo-linking";
import { useRouter, useLocalSearchParams } from "expo-router";
import { getWebProviderBaseUrl } from "@/lib/web-url";

const DEFAULT_PATH = "/provider/dashboard";

export default function PortalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ path?: string; title?: string }>();
  const pathParam = params.path ? decodeURIComponent(params.path) : DEFAULT_PATH;
  const path = pathParam.startsWith("/") ? pathParam : `/${pathParam}`;
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (hasRedirected.current) return;
    hasRedirected.current = true;
    const baseUrl = getWebProviderBaseUrl().replace(/\/$/, "");
    const url = `${baseUrl}${path}`;
    Linking.openURL(url).finally(() => {
      router.back();
    });
  }, [path, router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 12, fontSize: 14, color: "#6b7280" }}>Opening in browser…</Text>
    </View>
  );
}
