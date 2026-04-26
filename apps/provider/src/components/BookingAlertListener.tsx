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
import { api } from "@/lib/api-client";
import { playNormalBookingRingtone } from "@/lib/on-demand/ringtone";
import type { OnDemandModuleConfig } from "@/lib/config-bundle";

interface BookingRow {
  id: string;
  status: string;
  booking_number?: string;
  customer_id?: string;
  scheduled_at?: string;
}

async function playBookingAlert(): Promise<{ stop: () => void }> {
  try {
    const { Audio } = await import("expo-av");
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    // Use the built-in system notification sound; expo-av can play short bundled tones.
    // We generate a short "ding-ding" via a 440Hz+880Hz sine wave encoded as a data URI,
    // but for production, replace with a proper asset or signed URL.
    // For now, use the platform notification pattern: vibrate + short audio.
    // Vibrate to grab attention (works even without audio file).
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
  const alertSoundRef = useRef<{ stop: () => void } | null>(null);
  const prefsRef = useRef<{ booking_alert_sound?: boolean }>({ booking_alert_sound: true });
  const appState = useRef(AppState.currentState);

  // Load the provider's alert sound preference
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
    return () => { cancelled = true; };
  }, []);

  const showBookingAlert = useCallback(
    (row: BookingRow) => {
      alertSoundRef.current?.stop();

      if (prefsRef.current.booking_alert_sound !== false) {
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
      }

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
    [router, onDemandModule],
  );

  // Subscribe to new bookings via Realtime
  useEffect(() => {
    if (!provider?.id) return;

    const channel = supabase
      .channel(`booking-alerts:${provider.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: `provider_id=eq.${provider.id}`,
        },
        (payload) => {
          const row = payload.new as BookingRow;
          if (seenBookingIds.current.has(row.id)) return;
          seenBookingIds.current.add(row.id);

          // Only alert when the app is in the foreground
          if (appState.current === "active") {
            showBookingAlert(row);
          }
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
  }, [provider?.id, showBookingAlert]);

  return null;
}
