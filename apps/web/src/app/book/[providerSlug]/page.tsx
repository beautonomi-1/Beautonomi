"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, useRef } from "react";
import OnlineBookingFlowNew from "../components/OnlineBookingFlowNew";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_BOOKING_START } from "@/lib/analytics/amplitude/types";

/**
 * `/book/[providerSlug]` is reserved for:
 * - Embedded express booking (`?embed=1`) — compact "phone frame" UI
 * - Multi-service deep links (`?services=id1,id2,...`) — OnlineBookingFlowNew handles these
 *
 * All other visits redirect IMMEDIATELY (no provider fetch) to `/booking?slug=...`.
 * This avoids any chance of showing the wrong flow due to async provider loading.
 */
function BookProviderPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerSlug = params?.providerSlug as string;

  const embed = searchParams?.get("embed") === "1";
  const servicesParam = searchParams?.get("services") || "";
  const multiServiceDeepLink = servicesParam.split(",").filter(Boolean).length > 1;
  const useLegacyFlow = embed || multiServiceDeepLink;

  // For embed / multi-service we load the provider for OnlineBookingFlowNew
  const [provider, setProvider] = useState<{ id: string; slug: string; business_name: string } | null>(null);
  const [onlineBookingDisabled, setOnlineBookingDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { track, isReady } = useAmplitude();
  const bookingStartTracked = useRef(false);
  const didRedirectRef = useRef(false);

  // IMMEDIATE redirect for non-embed / non-multi-service — fired on first render,
  // no provider fetch needed. Prevents showing OnlineBookingFlowNew accidentally.
  useEffect(() => {
    if (!providerSlug || useLegacyFlow) return;
    if (didRedirectRef.current) return;
    didRedirectRef.current = true;
    const q = new URLSearchParams(searchParams?.toString() ?? "");
    q.set("slug", providerSlug);
    router.replace(`/booking?${q.toString()}`);
  // providerSlug and useLegacyFlow are both derived from URL params — stable on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only fetch provider data when we need OnlineBookingFlowNew
  useEffect(() => {
    if (!providerSlug || !useLegacyFlow) return;
    const load = async () => {
      try {
        const provRes = await fetcher.get<{ data: { id: string; slug: string; business_name: string } }>(
          `/api/public/providers/${encodeURIComponent(providerSlug)}`,
        );
        setProvider(provRes.data);
        try {
          await fetcher.get(`/api/public/providers/${encodeURIComponent(providerSlug)}/online-booking-settings`);
          setOnlineBookingDisabled(false);
        } catch (settingsErr) {
          if (settingsErr instanceof FetchError && settingsErr.status === 403) {
            setOnlineBookingDisabled(true);
          }
        }
      } catch (err) {
        setError(err instanceof FetchError ? err.message : "Failed to load provider");
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerSlug, useLegacyFlow]);

  useEffect(() => {
    if (provider && isReady && !bookingStartTracked.current && useLegacyFlow) {
      bookingStartTracked.current = true;
      track(EVENT_BOOKING_START, {
        provider_id: provider.id,
        provider_name: provider.business_name,
      });
    }
  }, [provider, isReady, track, useLegacyFlow]);

  if (!providerSlug) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Invalid booking link</p>
      </div>
    );
  }

  // Non-express: show transition screen while router.replace fires
  if (!useLegacyFlow) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingTimeout loadingMessage="Opening booking..." />
      </div>
    );
  }

  // Express / embed flow — needs provider data

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingTimeout loadingMessage="Loading booking..." />
      </div>
    );
  }

  if (onlineBookingDisabled) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">Online booking is not available</h1>
          <p className="text-muted-foreground">
            {provider.business_name} has not enabled online booking. Please contact them directly to book.
          </p>
          <Button asChild variant="outline">
            <Link href="/search">Find another provider</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <OnlineBookingFlowNew
      provider={provider}
      queryParams={{
        service: searchParams?.get("service") ?? undefined,
        services: searchParams?.get("services") ?? undefined,
        staff: searchParams?.get("staff") ?? undefined,
        location: searchParams?.get("location") ?? undefined,
        location_type: (searchParams?.get("location_type") as "at_home" | "at_salon") ?? undefined,
        anyone: searchParams?.get("anyone") === "true",
        date: searchParams?.get("date") ?? undefined,
        auth_return: searchParams?.get("auth_return") ?? undefined,
        addons: searchParams?.get("addons") ?? undefined,
        promo: searchParams?.get("promo") ?? undefined,
        gift_card: searchParams?.get("gift_card") ?? undefined,
        products: searchParams?.get("products") ?? undefined,
        package: searchParams?.get("package") ?? undefined,
      }}
      embed={embed}
    />
  );
}

export default function BookProviderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <LoadingTimeout loadingMessage="Loading..." />
        </div>
      }
    >
      <BookProviderPageContent />
    </Suspense>
  );
}
