"use client";

import { useEffect, useRef, useCallback } from "react";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeToBookings } from "@/lib/websocket/supabase-realtime";
import { useModuleConfig, useConfigBundle } from "@/providers/ConfigBundleProvider";
import { fetcher } from "@/lib/http/fetcher";
import { playNormalBookingAlertRingtone } from "@/lib/on-demand/normal-booking-ringtone";
import type { Environment } from "@/lib/config/types";

/**
 * When a new booking row is inserted for this provider, optionally play the
 * platform-configured normal-booking ringtone (if path set and preference on).
 */
export function ProviderBookingAlertListener() {
  const { provider } = useProviderPortal();
  const onDemand = useModuleConfig("on_demand");
  const { bundle } = useConfigBundle();
  const env = (bundle?.meta.env ?? "production") as Environment;
  const prefsRef = useRef({ booking_alert_sound: true });
  const seenIds = useRef(new Set<string>());
  const stopAudioRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data?: Record<string, unknown> }>(
          "/api/provider/notification-preferences",
          { staleTimeMs: 0 },
        );
        if (cancelled || !res) return;
        const inner = (res.data ?? res) as Record<string, unknown>;
        prefsRef.current = {
          booking_alert_sound: inner.booking_alert_sound !== false,
        };
      } catch {
        // default on
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onBookingEvent = useCallback(
    async (event: { type: string; data?: { id?: string } }) => {
      if (event.type !== "booking_created" || !event.data?.id) return;
      const id = event.data.id;
      if (seenIds.current.has(id)) return;
      seenIds.current.add(id);

      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      if (prefsRef.current.booking_alert_sound === false) return;

      const path = onDemand?.normal_booking_ringtone_asset_path?.trim();
      if (!path) return;

      stopAudioRef.current?.();
      const ctrl = await playNormalBookingAlertRingtone(
        {
          ringtone_asset_path: path,
          ring_duration_seconds: onDemand?.normal_booking_ring_duration_seconds ?? 20,
          ring_repeat: onDemand?.normal_booking_ring_repeat ?? true,
        },
        env,
      );
      stopAudioRef.current = ctrl.stop;
    },
    [onDemand, env],
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
      stopAudioRef.current?.();
      stopAudioRef.current = null;
    };
  }, [provider?.id, onBookingEvent]);

  return null;
}
