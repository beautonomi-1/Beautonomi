"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { WaitingIllustration } from "@/components/on-demand/WaitingIllustration";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@beautonomi/i18n";
import { getSupabaseClient } from "@/lib/supabase/client";
import { clearBeautonomiHoldClientMarkers } from "@/lib/booking/clear-hold-client-markers";
import { BookingEmbedBridge } from "@/components/booking/BookingEmbedBridge";
import { appendBookingEmbedQuery, isBookingEmbedEnabled } from "@beautonomi/utils";

interface OnDemandRequest {
  id: string;
  status: string;
  expires_at: string;
  booking_id?: string | null;
  provider_name?: string | null;
}

export default function OnDemandWaitingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = searchParams.get("requestId") ?? "";
  const embed = isBookingEmbedEnabled(searchParams);
  const onDemandConfig = useModuleConfig("on_demand");
  const [request, setRequest] = useState<OnDemandRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    clearBeautonomiHoldClientMarkers();
  }, []);

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
      setError(e instanceof FetchError ? e.message : t("web.book.onDemand.waiting.failedLoad"));
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      setError(t("web.book.onDemand.waiting.noRequestId"));
      return;
    }
    load();
  }, [requestId, load]);

  // Realtime: subscribe to UPDATEs on this request so status/booking_id appear without waiting for poll
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null>(null);
  useEffect(() => {
    if (!requestId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    channelRef.current = supabase
      .channel(`on-demand-${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "on_demand_requests",
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          if (payload.new) {
            const row = payload.new as Record<string, unknown>;
            setRequest((prev) => ({
              ...(prev ?? {}),
              ...row,
              provider_name: (row.provider_name as string) ?? prev?.provider_name ?? null,
            } as OnDemandRequest));
          }
        }
      )
      .subscribe();
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [requestId]);

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
      router.replace(
        appendBookingEmbedQuery(
          `/book/on-demand/result?status=expired&requestId=${encodeURIComponent(requestId)}`,
          embed,
        ),
      );
      return;
    }
    if (request.status === "accepted") {
      if (request.booking_id) {
        // Account-settings is not frameable. Stay on checkout/success so the
        // salon iframe does not go blank after the provider accepts.
        router.replace(
          appendBookingEmbedQuery(
            `/checkout/success?booking_id=${encodeURIComponent(request.booking_id)}`,
            embed,
          ),
        );
      } else {
        router.replace(
          appendBookingEmbedQuery(
            `/book/on-demand/result?status=accepted&requestId=${encodeURIComponent(requestId)}`,
            embed,
          ),
        );
      }
      return;
    }
    if (["declined", "cancelled", "expired"].includes(request.status)) {
      router.replace(
        appendBookingEmbedQuery(
          `/book/on-demand/result?status=${request.status}&requestId=${encodeURIComponent(requestId)}`,
          embed,
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redirect only when status/booking_id/requestId/secondsLeft change
  }, [request?.status, request?.booking_id, requestId, secondsLeft, router, embed]);

  const handleCancel = async () => {
    if (!requestId || request?.status !== "requested") return;
    if (!confirm(t("web.book.onDemand.waiting.cancelConfirm"))) return;
    setCancelling(true);
    try {
      await fetcher.post(`/api/me/on-demand/requests/${requestId}/cancel`, {});
      await load();
    } catch (e) {
      alert(e instanceof FetchError ? e.message : t("web.book.onDemand.waiting.failedCancel"));
    } finally {
      setCancelling(false);
    }
  };

  const uiCopy = (onDemandConfig?.ui_copy ?? {}) as Record<string, string>;
  const title = uiCopy.waiting_title ?? t("web.book.onDemand.waiting.title");
  const headline = uiCopy.waiting_headline ?? t("web.book.onDemand.waiting.headline");
  const providerMessageTemplate =
    uiCopy.waiting_provider_message ??
    t("web.book.onDemand.waiting.providerMessage");
  const providerDisplayName =
    request?.provider_name?.trim() || t("web.book.onDemand.waiting.providerFallback");
  const providerMessage = providerMessageTemplate.replace(
    /\{provider_name\}/gi,
    providerDisplayName
  );
  const timerLabel = uiCopy.waiting_timer_label ?? t("web.book.onDemand.waiting.timerLabel");
  const cancelCta = uiCopy.waiting_cancel_cta ?? t("web.book.onDemand.waiting.cancelCta");
  const helpUrl = uiCopy.waiting_help_url?.trim() || undefined;

  const shortRequestId = requestId
    ? `#${requestId.replace(/-/g, "").slice(-8).toUpperCase()}`
    : "";

  if (!requestId) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <p className="text-gray-600 mb-4">{t("web.book.onDemand.waiting.missingRequestId")}</p>
        {!embed ? (
          <Button variant="outline" asChild>
            <Link href="/">{t("web.book.onDemand.waiting.back")}</Link>
          </Button>
        ) : null}
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
        <Button onClick={() => { setLoading(true); load(); }}>{t("web.book.onDemand.waiting.retry")}</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <BookingEmbedBridge active={embed} />
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
            {t("web.book.onDemand.waiting.help")}
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
            {cancelling ? t("web.book.onDemand.waiting.cancelling") : cancelCta}
          </Button>
        </div>
      </div>
    </div>
  );
}
