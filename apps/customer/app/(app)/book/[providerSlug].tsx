import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Universal link /book/{slug} → in-app book flow with ?slug=
 */
export default function BookProviderSlugScreen() {
  const { providerSlug } = useLocalSearchParams<{ providerSlug?: string }>();
  const slug = typeof providerSlug === "string" ? providerSlug : "";
  if (!slug) {
    return <Redirect href="/(app)/(tabs)/explore" />;
  }
  return <Redirect href={`/(app)/book?slug=${encodeURIComponent(slug)}`} />;
}
