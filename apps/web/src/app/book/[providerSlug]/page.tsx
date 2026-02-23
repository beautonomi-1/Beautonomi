"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import OnlineBookingFlowNew from "../components/OnlineBookingFlowNew";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function BookProviderPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const providerSlug = params?.providerSlug as string;
  const [provider, setProvider] = useState<{ id: string; slug: string; business_name: string } | null>(null);
  const [onlineBookingDisabled, setOnlineBookingDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerSlug) return;
    const load = async () => {
      try {
        const provRes = await fetcher.get<{ data: { id: string; slug: string; business_name: string } }>(
          `/api/public/providers/${encodeURIComponent(providerSlug)}`
        );
        setProvider(provRes.data);
        try {
          await fetcher.get(
            `/api/public/providers/${encodeURIComponent(providerSlug)}/online-booking-settings`
          );
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

  if (!providerSlug) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Invalid booking link</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!provider) {
    return (
      <Suspense fallback={<LoadingTimeout loadingMessage="Loading..." />}>
        <div className="min-h-screen flex items-center justify-center">
          <LoadingTimeout loadingMessage="Loading provider..." />
        </div>
      </Suspense>
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
        staff: searchParams?.get("staff") ?? undefined,
        location: searchParams?.get("location") ?? undefined,
        location_type: (searchParams?.get("location_type") as "at_home" | "at_salon") ?? undefined,
        anyone: searchParams?.get("anyone") === "true",
        date: searchParams?.get("date") ?? undefined,
        auth_return: searchParams?.get("auth_return") ?? undefined,
      }}
      embed={searchParams?.get("embed") === "1"}
    />
  );
}
