"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ExpressLinkResponse {
  provider_slug: string;
  provider_id: string;
  provider_name: string;
  link_name: string;
  service_ids: string[];
  staff_ids: string[];
  location_id?: string | null;
  location_type?: string | null;
}

export default function ExpressBookLinkPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkSlug = params?.linkSlug as string;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!linkSlug) return;
    const resolve = async () => {
      try {
        const res = await fetcher.get<{ data: ExpressLinkResponse }>(
          `/api/public/express-link/${encodeURIComponent(linkSlug)}`
        );
        const data = res.data;
        if (!data?.provider_slug) {
          setError("Booking link not found");
          return;
        }
        const q = new URLSearchParams();
        if (data.service_ids?.length) {
          if (data.service_ids.length === 1) {
            q.set("service", data.service_ids[0]);
          } else {
            q.set("services", data.service_ids.join(","));
          }
        }
        if (data.staff_ids?.[0]) q.set("staff", data.staff_ids[0]);
        if (data.location_type === "at_home") {
          q.set("location_type", "at_home");
        } else if (data.location_type === "at_salon" || data.location_id) {
          q.set("location_type", "at_salon");
          if (data.location_id) q.set("location", data.location_id);
        }
        if (searchParams?.get("embed") === "1") q.set("embed", "1");
        const query = q.toString();
        const target = `/book/${encodeURIComponent(data.provider_slug)}${query ? `?${query}` : ""}`;
        router.replace(target);
      } catch (err) {
        const message =
          err instanceof FetchError
            ? (err.status === 404 ? "Booking link not found or expired" : err.message)
            : "Failed to load booking link";
        setError(message);
      }
    };
    resolve();
  }, [linkSlug, router, searchParams]);

  if (!linkSlug) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Invalid booking link</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-destructive text-center">{error}</p>
        <Button asChild variant="outline">
          <Link href="/search">Find a provider</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingTimeout loadingMessage="Opening booking..." />
    </div>
  );
}
