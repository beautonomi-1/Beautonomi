"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import OnlineBookingFlowNew from "../components/OnlineBookingFlowNew";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_BOOKING_START } from "@/lib/analytics/amplitude/types";

interface Props {
  providerSlug: string;
}

/**
 * Client entry for `/book/[providerSlug]` when the server keeps the request on this route
 * (any booking deep link: embed, single/multi service, express venue/staff/prefill, package, etc.).
 * Bare `/book/[slug]` with no query is 308-redirected to `/booking?slug=…` on the server.
 */
export default function BookProviderClient({ providerSlug }: Props) {
  const searchParams = useSearchParams();
  const embed = searchParams?.get("embed") === "1";

  const [provider, setProvider] = useState<{
    id: string;
    slug: string;
    business_name: string;
    timezone?: string | null;
  } | null>(null);
  const [onlineBookingDisabled, setOnlineBookingDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { track, isReady } = useAmplitude();
  const bookingStartTracked = useRef(false);

  useEffect(() => {
    if (!providerSlug) return;
    const load = async () => {
      try {
        const provRes = await fetcher.get<{
          data: { id: string; slug: string; business_name: string; timezone?: string | null };
        }>(
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
  }, [providerSlug]);

  useEffect(() => {
    if (provider && isReady && !bookingStartTracked.current) {
      bookingStartTracked.current = true;
      track(EVENT_BOOKING_START, {
        provider_id: provider.id,
        provider_name: provider.business_name,
      });
    }
  }, [provider, isReady, track]);

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
        service: searchParams?.get("service") ?? searchParams?.get("serviceId") ?? undefined,
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
