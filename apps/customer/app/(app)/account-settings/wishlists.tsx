import { useLocalSearchParams } from "expo-router";
import { SavedTabContent } from "@/components/SavedTabContent";

export default function WishlistsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const initialTab = params.tab === "posts" ? "posts" : "providers";

  return (
    <SavedTabContent
      showRecentlyViewed={true}
      screenName="Wishlists"
      initialTab={initialTab}
    />
  );
}
