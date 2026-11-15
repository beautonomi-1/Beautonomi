"use client";

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeToBookings } from "@/lib/websocket/supabase-realtime";
import { useModuleConfig, useConfigBundle } from "@/providers/ConfigBundleProvider";
import { fetcher } from "@/lib/http/fetcher";
import { playNormalBookingAlertRingtone } from "@/lib/on-demand/normal-booking-ringtone";
import type { Environment } from "@/lib/config/types";

/** Fired by notification settings after booking-alert sound is saved. */
export const BOOKING_ALERT_SOUND_PREF_EVENT = "beautonomi:booking-alert-sound";

const BOOKING_ALERT_TOAST_ID = "provider-booking-alert-sound";

/**
 * When a new booking row is inserted for this provider, optionally play the
 * platform-configured normal-booking ringtone (if path set and preference on).
 * A booking that arrives while the tab is hidden is played once the tab is visible again.
 */
export function ProviderBookingAlertListener() {
  const { t } = useTranslation();
  const { provider } = useProviderPortal();
  const onDemand = useModuleConfig("on_demand");
  const { bundle } = useConfigBundle();
  const env = (bundle?.meta.env ??
    (process.env.NODE_ENV === "development" ? "development" : "production")) as Environment;
  const prefsRef = useRef({ booking_alert_sound: true });
  const prefsGen = useRef(0);
  const seenIds = useRef(new Set<string>());
  const seenGroupIds = useRef(new Set<string>());
  const pendingWhileHidden = useRef(new Set<string>());
  const stopAudioRef = useRef<(() => void) | null>(null);
  const playGen = useRef(0);
  const soundRef = useRef({
    path: "",
    duration: 20,
    repeat: true,
    env,
  });
  const configuredDuration = onDemand?.normal_booking_ring_duration_seconds;
  soundRef.current = {
    path: onDemand?.normal_booking_ringtone_asset_path?.trim() ?? "",
    duration: typeof configuredDuration === "number" && configuredDuration > 0 ? configuredDuration : 20,
    repeat: onDemand?.normal_booking_ring_repeat ?? true,
    env,
  };

  const loadPrefs = useCallback(async () => {
    const gen = ++prefsGen.current;
    try {
      const res = await fetcher.get<{ data?: Record<string, unknown> }>(
        "/api/provider/notification-preferences",
        { staleTimeMs: 0 },
      );
      if (!res || prefsGen.current !== gen) return;
      const inner = (res.data ?? res) as Record<string, unknown>;
      prefsRef.current = {
        booking_alert_sound: inner.booking_alert_sound !== false,
      };
    } catch {
      // Keep the last known setting.
    }
  }, []);

  const stopCurrent = useCallback(() => {
    playGen.current += 1;
    stopAudioRef.current?.();
    stopAudioRef.current = null;
    toast.dismiss(BOOKING_ALERT_TOAST_ID);
  }, []);

  const playNow = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const sound = soundRef.current;
    const audible = prefsRef.current.booking_alert_sound !== false && Boolean(sound.path);
    if (!audible) {
      toast("New booking", {
        id: BOOKING_ALERT_TOAST_ID,
        duration: 8000,
        action: {
          label: t("common.dismiss"),
          onClick: () => toast.dismiss(BOOKING_ALERT_TOAST_ID),
        },
      });
      return;
    }
    stopCurrent();
    const gen = playGen.current;
    const durationMs = Math.max(1000, sound.duration * 1000);
    void playNormalBookingAlertRingtone(
      {
        ringtone_asset_path: sound.path,
        ring_duration_seconds: sound.duration,
        ring_repeat: sound.repeat,
      },
      sound.env,
    ).then((ctrl) => {
      if (playGen.current !== gen) {
        ctrl.stop();
        return;
      }
      stopAudioRef.current = ctrl.stop;
      void ctrl.started.then((playing) => {
        if (playGen.current !== gen || stopAudioRef.current !== ctrl.stop) {
          ctrl.stop();
          return;
        }
        const hidden = typeof document !== "undefined" && document.visibilityState !== "visible";
        const keepSound = playing && prefsRef.current.booking_alert_sound !== false && !hidden;
        if (!keepSound) {
          ctrl.stop();
          if (stopAudioRef.current === ctrl.stop) stopAudioRef.current = null;
        }
        if (hidden) return;
        toast("New booking", {
          id: BOOKING_ALERT_TOAST_ID,
          duration: keepSound ? durationMs : 8000,
          action: {
            label: t("common.dismiss"),
            onClick: () => stopCurrent(),
          },
          onDismiss: () => {
            if (playGen.current !== gen) return;
            ctrl.stop();
            if (stopAudioRef.current === ctrl.stop) stopAudioRef.current = null;
          },
        });
      });
    });
  }, [stopCurrent, t]);

  const flushHidden = useCallback(() => {
    if (pendingWhileHidden.current.size === 0) return;
    const ids = [...pendingWhileHidden.current];
    pendingWhileHidden.current.clear();
    for (const id of ids) seenIds.current.add(id);
    void playNow();
  }, [playNow]);

  useEffect(() => {
    void loadPrefs();
    const onPref = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      if (typeof detail === "boolean") {
        prefsGen.current += 1;
        prefsRef.current = { booking_alert_sound: detail };
        if (!detail) stopCurrent();
        return;
      }
      void loadPrefs().then(() => {
        if (prefsRef.current.booking_alert_sound === false) stopCurrent();
      });
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        stopCurrent();
        return;
      }
      void loadPrefs().finally(() => flushHidden());
    };
    window.addEventListener(BOOKING_ALERT_SOUND_PREF_EVENT, onPref);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(BOOKING_ALERT_SOUND_PREF_EVENT, onPref);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadPrefs, flushHidden, stopCurrent]);

  const onBookingEvent = useCallback(
    (event: { type: string; data?: { id?: string; status?: string; group_booking_id?: string | null } }) => {
      if (event.type !== "booking_created" || !event.data?.id) return;
      const id = event.data.id;
      if (seenIds.current.has(id) || pendingWhileHidden.current.has(id)) return;

      const status = String(event.data.status || "").toLowerCase();
      if (status && !["pending", "booked", "confirmed", "pending_payment"].includes(status)) {
        seenIds.current.add(id);
        return;
      }

      const groupId = event.data.group_booking_id?.trim();
      if (groupId) {
        if (seenGroupIds.current.has(groupId)) {
          seenIds.current.add(id);
          return;
        }
        seenGroupIds.current.add(groupId);
      }

      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        pendingWhileHidden.current.add(id);
        return;
      }

      seenIds.current.add(id);
      void playNow();
    },
    [playNow],
  );

  useEffect(() => {
    if (!provider?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const unsub = subscribeToBookings(supabase, provider.id, (ev) => {
      void onBookingEvent(ev);
    });

    return () => {
      unsub();
      stopCurrent();
    };
  }, [provider?.id, onBookingEvent, stopCurrent]);

  return null;
}
