import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Universal link bridge: https://beautonomi.com/explore/{id} → in-app post detail.
 */
export default function ExplorePostUniversalLinkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id || typeof id !== "string") {
    return <Redirect href="/(app)/(tabs)/explore" />;
  }
  return <Redirect href={{ pathname: "/(app)/explore-post", params: { id } }} />;
}
