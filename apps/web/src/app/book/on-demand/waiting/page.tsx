"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { WaitingIllustration } from "@/components/on-demand/WaitingIllustration";
import { Button } from "@/components/ui/button";

interface OnDemandRequest {
  id: string;
  status: string;
  expires_at: string;
  booking_id?: string | null;
  provider_name?: string | null;
}

export default function OnDemandWaitingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = searchParams.get("requestId") ?? "";
  const onDemandConfig = useModuleConfig("on_demand");
  const [request, setRequest] = useState<OnDemandRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!requestId) return;
    try {
      const res = await fetcher.get<{ data: OnDemandRequest }>(
        `/api/me/on-demand/requests/${encodeURIComponent(requestId)}`
      );
      const data = (res as { data?: OnDemandRequest }).data ?? null;
      setRequest(data ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof FetchError ? e.message : "Failed to load");
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      setError("No request ID");
      return;
    }
    load();
  }, [requestId, load]);

  useEffect(() => {
    if (!requestId || !request) return;
    pollRef.current = setInterval(load, 12000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll when request id is set; avoid resetting on every request shape change
  }, [requestId, request?.id, load]);

  useEffect(() => {
    if (!request?.expires_at || request.status !== "requested") return;
    const tick = () => {
      const now = new Date();
      const exp = new Date(request.expires_at);
      setSecondsLeft(Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [request?.expires_at, request?.status]);

  useEffect(() => {
    if (!request) return;
    if (request.status === "requested" && secondsLeft !== null && secondsLeft <= 0) {
      router.replace(`/book/on-demand/result?status=expired&requestId=${encodeURIComponent(requestId)}`);
      return;
    }
    if (request.status === "accepted") {
      if (request.booking_id) {
        router.replace(`/account-settings/bookings/${request.booking_id}`);
      } else {
        router.replace(`/book/on-demand/result?status=accepted&requestId=${encodeURIComponent(requestId)}`);
      }
      return;
    }
    if (["declined", "cancelled", "expired"].includes(request.status)) {
      router.replace(`/book/on-demand/result?status=${request.status}&requestId=${encodeURIComponent(requestId)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redirect only when status/booking_id/requestId/secondsLeft change
  }, [request?.status, request?.booking_id, requestId, secondsLeft, router]);

  const handleCancel = async () => {
    if (!requestId || request?.status !== "requested") return;
    if (!confirm("Are you sure you want to cancel this request?")) return;
    setCancelling(true);
    try {
      await fetcher.post(`/api/me/on-demand/requests/${requestId}/cancel`, {});
      await load();
    } catch (e) {
      alert(e instanceof FetchError ? e.message : "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  const uiCopy = (onDemandConfig?.ui_copy ?? {}) as Record<string, string>;
  const title = uiCopy.waiting_title ?? "Request sent";
  const headline = uiCopy.waiting_headline ?? "Connecting you with beauty.";
  const providerMessageTemplate =
    uiCopy.waiting_provider_message ??
    "We'll confirm your booking as soon as we hear back from {provider_name}.";
  const providerDisplayName = request?.provider_name?.trim() || "your provider";
  const providerMessage = providerMessageTemplate.replace(
    /\{provider_name\}/gi,
    providerDisplayName
  );
  const timerLabel = uiCopy.waiting_timer_label ?? "Time remaining";
  const cancelCta = uiCopy.waiting_cancel_cta ?? "Cancel request";
  const helpUrl = uiCopy.waiting_help_url?.trim() || undefined;

  const shortRequestId = requestId
    ? `#${requestId.replace(/-/g, "").slice(-8).toUpperCase()}`
    : "";

  if (!requestId) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <p className="text-gray-600 mb-4">Missing request ID</p>
        <Button variant="outline" asChild>
          <Link href="/">Back</Link>
        </Button>
      </div>
    );
  }

  if (loading && !request) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <p className="text-gray-600 mb-4">{error}</p>
        <Button onClick={() => { setLoading(true); load(); }}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="flex-1 px-6 pt-6 pb-6 max-w-md mx-auto w-full">
        <div className="flex flex-row items-center justify-between mb-2">
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
          {shortRequestId ? (
            <span className="text-sm font-mono text-gray-500">{shortRequestId}</span>
          ) : null}
        </div>
        {helpUrl ? (
          <a
            href={helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary font-medium mb-4 inline-block"
          >
            Help
          </a>
        ) : null}

        <WaitingIllustration />

        <h2 className="text-xl font-semibold text-gray-900 text-center mt-2">
          {headline}
        </h2>
        <p className="text-gray-600 text-center mt-3 px-2">
          {providerMessage}
        </p>

        {secondsLeft !== null && (
          <div className="flex flex-col items-center py-8">
            <span className="text-3xl font-mono font-semibold text-gray-900">
              {Math.floor(secondsLeft / 60)}:
              {(secondsLeft % 60).toString().padStart(2, "0")}
            </span>
            <span className="text-gray-500 text-sm mt-1">{timerLabel}</span>
          </div>
        )}

        <div className="mt-auto pt-6">
          <Button
            variant="outline"
            className="w-full rounded-2xl py-6 border-gray-300 bg-white"
            onClick={handleCancel}
            disabled={cancelling || request?.status !== "requested"}
          >
            {cancelling ? "Cancelling…" : cancelCta}
          </Button>
        </div>
      </div>
    </div>
  );
}
