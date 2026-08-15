import { useEffect } from "react";
import { AppState } from "react-native";
import {
  startApplePurchaseListener,
  syncUnfinishedApplePurchases,
} from "@/lib/iap/apple-iap";
import { shouldUseAppleIap } from "@/lib/iap/platform";
import { useProvider } from "@/providers/ProviderContext";

/**
 * Syncs unfinished StoreKit transactions at launch, on foreground, and via
 * purchaseUpdatedListener so a new phone (or a killed checkout) does not
 * depend on the user opening Subscription.
 */
export function AppleIapSyncListener() {
  const { provider } = useProvider();
  const providerId = provider?.id;

  useEffect(() => {
    if (!shouldUseAppleIap() || !providerId) return;

    void syncUnfinishedApplePurchases(providerId);

    let cancelled = false;
    let stopListener: (() => void) | undefined;
    void startApplePurchaseListener(providerId).then((stop) => {
      if (cancelled) {
        stop();
        return;
      }
      stopListener = stop;
    });

    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void syncUnfinishedApplePurchases(providerId);
      }
    });

    return () => {
      cancelled = true;
      stopListener?.();
      appState.remove();
    };
  }, [providerId]);

  return null;
}
