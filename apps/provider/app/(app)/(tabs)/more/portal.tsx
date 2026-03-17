/**
 * Portal: opens the provider web path in the in-app browser (WebView).
 * Route: (app)/(tabs)/more/portal?path=/provider/...
 * When no title param is passed, fetches profile to use business name as browser title.
 */
import { useEffect, useRef } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useApi } from "@/hooks/useApi";
import { getWebProviderBaseUrl } from "@/lib/web-url";

const DEFAULT_PATH = "/provider/dashboard";

interface ProviderProfile {
  business_name: string | null;
}

export default function PortalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ path?: string; title?: string }>();
  const pathParam = params.path ? decodeURIComponent(params.path) : DEFAULT_PATH;
  const path = pathParam.startsWith("/") ? pathParam : `/${pathParam}`;
  const titleParam = params.title ? decodeURIComponent(params.title) : null;
  const { data: profile, loading } = useApi<ProviderProfile>("/api/provider/profile");
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (hasRedirected.current) return;
    if (!titleParam && loading) return;
    const displayTitle = titleParam ?? profile?.business_name?.trim() ?? "Portal";
    hasRedirected.current = true;
    const baseUrl = getWebProviderBaseUrl().replace(/\/$/, "");
    const url = `${baseUrl}${path}`;
    router.replace({
      pathname: "/(app)/(tabs)/more/in-app-browser",
      params: { url: encodeURIComponent(url), title: encodeURIComponent(displayTitle) },
    } as never);
  }, [path, titleParam, loading, profile?.business_name, router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 12, fontSize: 14, color: "#6b7280" }}>Opening portal…</Text>
    </View>
  );
}
