"use client";

import { useParams, useRouter } from "next/navigation";
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
}

export default function ExpressBookLinkPage() {
  const params = useParams();
  const router = useRouter();
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
        const searchParams = new URLSearchParams();
        if (data.service_ids?.[0]) searchParams.set("service", data.service_ids[0]);
        if (data.staff_ids?.[0]) searchParams.set("staff", data.staff_ids[0]);
        const query = searchParams.toString();
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
  }, [linkSlug, router]);

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
