"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { playRingtone } from "@/lib/on-demand/ringtone";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Bell } from "lucide-react";

interface OnDemandRequestRow {
  id: string;
  status: string;
  requested_at: string;
  expires_at: string;
  request_payload?: Record<string, unknown>;
}

export function OnDemandIncomingOverlay() {
  const onDemandConfig = useModuleConfig("on_demand");
  const [incomingRequest, setIncomingRequest] = useState<OnDemandRequestRow | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const ringtoneStopRef = useRef<(() => void) | null>(null);

  const acceptGlobalEnabled = useFeatureFlag("on_demand_accept_enabled");
  const acceptProviderEnabled = useFeatureFlag("on_demand_accept_provider_enabled");
  const onDemandAcceptEnabled = acceptGlobalEnabled && acceptProviderEnabled;

  useEffect(() => {
    if (!onDemandConfig.enabled || !onDemandAcceptEnabled) return;

    const poll = async () => {
      try {
        const res = await fetcher.get<{ data: OnDemandRequestRow[] }>("/api/provider/on-demand/requests");
        const list = (res.data ?? []) as OnDemandRequestRow[];
        const requested = list.filter((r) => r.status === "requested");
        const next = requested.find((r) => !seenIdsRef.current.has(r.id));
        if (next) {
          seenIdsRef.current.add(next.id);
          setIncomingRequest(next);
        }
      } catch {
        // ignore
      }
    };

    const interval = setInterval(poll, 10000);
    poll();
    return () => clearInterval(interval);
  }, [onDemandConfig.enabled, onDemandAcceptEnabled]);

  useEffect(() => {
    return () => {
      ringtoneStopRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!incomingRequest || incomingRequest.status !== "requested") return;
    if (!onDemandConfig.enabled || !onDemandConfig.ringtone_asset_path) return;
    ringtoneStopRef.current?.();
    playRingtone(
      {
        enabled: onDemandConfig.enabled,
        ringtone_asset_path: onDemandConfig.ringtone_asset_path,
        ring_duration_seconds: onDemandConfig.ring_duration_seconds ?? 20,
        ring_repeat: onDemandConfig.ring_repeat ?? true,
      },
      { environment: typeof window !== "undefined" && (window as any).__DEV__ ? "development" : "production" }
    ).then((ctrl) => {
      ringtoneStopRef.current = ctrl.stop;
    });
  }, [incomingRequest?.id, incomingRequest?.status, onDemandConfig.enabled, onDemandConfig.ringtone_asset_path]);

  useEffect(() => {
    if (!incomingRequest?.expires_at || incomingRequest.status !== "requested") return;
    const tick = () => {
      const now = Date.now();
      const exp = new Date(incomingRequest.expires_at).getTime();
      setSecondsLeft(Math.max(0, Math.ceil((exp - now) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [incomingRequest?.expires_at, incomingRequest?.status]);

  const stopRingtoneAndClose = () => {
    ringtoneStopRef.current?.();
    setIncomingRequest(null);
  };

  const handleAccept = async () => {
    if (!incomingRequest?.id) return;
    ringtoneStopRef.current?.();
    setAccepting(true);
    try {
      const res = await fetcher.post<{ data: { request: OnDemandRequestRow; booking_id: string } }>(
        `/api/provider/on-demand/requests/${incomingRequest.id}/accept`,
        {}
      );
      const payload = (res as { data?: { request: OnDemandRequestRow; booking_id: string } }).data;
      if (payload?.booking_id) {
        toast.success("Request accepted");
        window.location.href = `/provider/bookings/${payload.booking_id}`;
      } else {
        toast.success("Request accepted");
        setIncomingRequest(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept");
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!incomingRequest?.id) return;
    ringtoneStopRef.current?.();
    setDeclining(true);
    try {
      await fetcher.post(`/api/provider/on-demand/requests/${incomingRequest.id}/decline`, {});
      toast.success("Request declined");
      setIncomingRequest(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to decline");
    } finally {
      setDeclining(false);
    }
  };

  if (!onDemandAcceptEnabled) return null;
  if (!incomingRequest || incomingRequest.status !== "requested") return null;

  const uiCopy = (onDemandConfig.ui_copy ?? {}) as Record<string, string>;
  const title = uiCopy.provider_incoming_title ?? "Incoming request";
  const subtitle = uiCopy.provider_incoming_subtitle ?? "A client is requesting a booking now";
  const acceptCta = uiCopy.provider_accept_cta ?? "Accept";
  const declineCta = uiCopy.provider_decline_cta ?? "Decline";

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Bell className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <p className="text-gray-600 text-sm mt-1">{subtitle}</p>
        </div>
        {incomingRequest.request_payload?.services && (
          <p className="text-gray-500 text-sm mb-4">
            {(incomingRequest.request_payload.services as unknown[]).length} service(s) selected
          </p>
        )}
        {secondsLeft !== null && (
          <div className="text-center mb-6">
            <span className="text-2xl font-mono font-semibold text-gray-900">
              {Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, "0")}
            </span>
            <p className="text-xs text-gray-500 mt-1">Time remaining</p>
          </div>
        )}
        <div className="flex gap-3">
          <Button
            onClick={handleAccept}
            disabled={accepting || declining}
            className="flex-1"
          >
            {accepting ? "Accepting..." : acceptCta}
          </Button>
          <Button
            variant="outline"
            onClick={handleDecline}
            disabled={accepting || declining}
            className="flex-1"
          >
            {declining ? "Declining..." : declineCta}
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
