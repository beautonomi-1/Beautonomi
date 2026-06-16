/**
 * Listens for new bookings via Supabase Realtime and plays an alert sound
 * to grab the provider's attention. Can be toggled on/off in notification settings.
 * Mounted alongside OnDemandIncomingListener in the app layout.
 */
import { useEffect, useRef, useCallback } from "react";
import { Alert, AppState, Platform, Vibration } from "react-native";
import { useRouter } from "expo-router";
import { useProvider } from "@/providers/ProviderContext";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";
import { api } from "@/lib/api-client";
import { playNormalBookingRingtone } from "@/lib/on-demand/ringtone";
import type { OnDemandModuleConfig } from "@/lib/config-bundle";
import {
  handleBookingAlertRow,
  type BookingAlertRow,
} from "@/lib/booking-alert-handler";

async function playBookingAlert(): Promise<{ stop: () => void }> {
  try {
    const { Audio } = await import("expo-av");
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    if (Platform.OS !== "web") {
      Vibration.vibrate([0, 400, 200, 400]);
    }
    return {
      stop: () => {
        Vibration.cancel();
      },
    };
  } catch {
    return { stop: () => {} };
  }
}

export function BookingAlertListener() {
  const router = useRouter();
  const { provider } = useProvider();
  const onDemandModule = useModuleConfig("on_demand") as OnDemandModuleConfig;
  const seenBookingIds = useRef<Set<string>>(new Set());
  const seenGroupBookingIds = useRef<Set<string>>(new Set());
  const alertSoundRef = useRef<{ stop: () => void } | null>(null);
  const prefsRef = useRef<{ booking_alert_sound?: boolean }>({ booking_alert_sound: true });
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<Record<string, unknown>>("/api/provider/notification-preferences");
        if (!cancelled && res.data) {
          const data = res.data as Record<string, unknown>;
          const inner = (data.preferences ?? data.data ?? data) as Record<string, unknown>;
          prefsRef.current = {
            booking_alert_sound: inner.booking_alert_sound !== false,
          };
        }
      } catch {
        // Default to enabled
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const playAlertSound = useCallback(() => {
    alertSoundRef.current?.stop();
    if (prefsRef.current.booking_alert_sound === false) return;

    const useAsset = Boolean(onDemandModule.normal_booking_ringtone_asset_path?.trim());
    if (useAsset) {
      playNormalBookingRingtone(onDemandModule).then((ctrl) => {
        alertSoundRef.current = ctrl;
      });
    } else {
      playBookingAlert().then((ctrl) => {
        alertSoundRef.current = ctrl;
      });
    }
  }, [onDemandModule]);

  const showIndividualBookingAlert = useCallback(
    (row: BookingAlertRow) => {
      playAlertSound();

      const title = "New Booking!";
      const message = row.booking_number
        ? `Booking ${row.booking_number} has been placed.`
        : "You have a new booking. Tap to view details.";

      Alert.alert(title, message, [
        {
          text: "View",
          onPress: () => {
            alertSoundRef.current?.stop();
            router.push({
              pathname: "/(app)/(tabs)/bookings/[id]",
              params: { id: row.id },
            });
          },
        },
        {
          text: "Dismiss",
          style: "cancel",
          onPress: () => {
            alertSoundRef.current?.stop();
          },
        },
      ]);
    },
    [playAlertSound, router],
  );

  const showGroupBookingAlert = useCallback(
    (groupBookingId: string) => {
      playAlertSound();

      Alert.alert("New group booking", "A new group session was booked. Tap to view.", [
        {
          text: "View",
          onPress: () => {
            alertSoundRef.current?.stop();
            router.push({
              pathname: "/(app)/(tabs)/more/group-bookings",
              params: { open_group_id: groupBookingId },
            } as never);
          },
        },
        {
          text: "Dismiss",
          style: "cancel",
          onPress: () => {
            alertSoundRef.current?.stop();
          },
        },
      ]);
    },
    [playAlertSound, router],
  );

  const onRealtimeRow = useCallback(
    (row: BookingAlertRow) => {
      handleBookingAlertRow(
        row,
        seenBookingIds.current,
        seenGroupBookingIds.current,
        appState.current === "active",
        {
          showIndividualAlert: showIndividualBookingAlert,
          showGroupAlert: showGroupBookingAlert,
        },
      );
    },
    [showIndividualBookingAlert, showGroupBookingAlert],
  );

  useEffect(() => {
    if (!provider?.id) return;

    const channel = supabase
      .channel(nextRealtimeTopic(`booking-alerts:${provider.id}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: `provider_id=eq.${provider.id}`,
        },
        (payload) => {
          onRealtimeRow(payload.new as BookingAlertRow);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `provider_id=eq.${provider.id}`,
        },
        (payload) => {
          onRealtimeRow(payload.new as BookingAlertRow);
        },
      )
      .subscribe();

    const appStateSub = AppState.addEventListener("change", (next) => {
      appState.current = next;
    });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
      appStateSub.remove();
      alertSoundRef.current?.stop();
    };
  }, [provider?.id, onRealtimeRow]);

  return null;
}
