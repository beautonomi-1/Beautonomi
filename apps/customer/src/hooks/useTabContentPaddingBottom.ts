import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tabScrollContentPaddingBottom } from "@/constants/layout";

/**
 * Bottom padding for scrollable tab content so it clears the bottom tab bar and home indicator.
 */
export function useTabContentPaddingBottom(extraSlack = 16) {
  const insets = useSafeAreaInsets();
  return tabScrollContentPaddingBottom(insets.bottom, extraSlack);
}
