import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { useProvider } from "@/providers/ProviderContext";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";
import { playAlertCue } from "@/lib/alert-sound";
import {
  flushPendingOrderAlerts,
  handleOrderAlertRow,
  type OrderAlertRow,
} from "@/lib/order-alert-handler";
import {
  getAlertSoundPrefs,
  refreshAlertSoundPrefs,
  subscribeAlertSoundPrefs,
} from "@/lib/notification-alert-prefs";
import { useInAppBanner } from "@/providers/InAppBannerProvider";

export function OrderAlertListener() {
  const router = useRouter();
  const { provider } = useProvider();
  const { show } = useInAppBanner();
  const seenOrderIds = useRef<Set<string>>(new Set());
  const pendingWhenInactive = useRef<OrderAlertRow[]>([]);
  const appState = useRef(AppState.currentState);
  const cueRef = useRef<{ stop: () => void } | null>(null);

  const showOrderBanner = useCallback(
    (row: OrderAlertRow) => {
      if (getAlertSoundPrefs().order_alert_sound !== false) {
        cueRef.current?.stop();
        void playAlertCue().then((ctrl) => {
          cueRef.current = ctrl;
        });
      }

      const label = row.order_number?.trim() || "New order";
      show({
        icon: "bag-handle-outline",
        title: "New order",
        message: `${label} — tap to view details.`,
        tone: "success",
        onPress: () => {
          cueRef.current?.stop();
          router.push(
            `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(row.id)}` as never,
          );
        },
      });
    },
    [router, show],
  );

  const flushPending = useCallback(() => {
    flushPendingOrderAlerts(pendingWhenInactive.current, seenOrderIds.current, showOrderBanner);
  }, [showOrderBanner]);

  const onRow = useCallback(
    (event: "insert" | "update", row: OrderAlertRow, oldRow?: OrderAlertRow | null) => {
      handleOrderAlertRow(
        event,
        row,
        seenOrderIds.current,
        appState.current === "active",
        showOrderBanner,
        pendingWhenInactive.current,
        oldRow,
      );
    },
    [showOrderBanner],
  );

  useEffect(() => {
    void refreshAlertSoundPrefs();
    return subscribeAlertSoundPrefs(() => {
      void refreshAlertSoundPrefs();
    });
  }, []);

  useEffect(() => {
    if (!provider?.id) return;

    const channel = supabase
      .channel(nextRealtimeTopic(`order-alerts:${provider.id}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "product_orders",
          filter: `provider_id=eq.${provider.id}`,
        },
        (payload) => {
          onRow("insert", payload.new as OrderAlertRow);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "product_orders",
          filter: `provider_id=eq.${provider.id}`,
        },
        (payload) => {
          onRow("update", payload.new as OrderAlertRow, payload.old as OrderAlertRow);
        },
      )
      .subscribe();

    const appStateSub = AppState.addEventListener("change", (next) => {
      appState.current = next;
      if (next === "active") {
        void refreshAlertSoundPrefs();
        flushPending();
      }
    });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
      appStateSub.remove();
      cueRef.current?.stop();
    };
  }, [provider?.id, onRow, flushPending]);

  return null;
}
