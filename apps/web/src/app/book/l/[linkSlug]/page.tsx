"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ExpressPrefill } from "@/lib/express-booking/prefill";
import { productCartToQueryParam } from "@/lib/express-booking/prefill";
import { getOsTypeFromNavigator } from "@/lib/utils/os-type";
import { useAuth } from "@/providers/AuthProvider";

interface ExpressLinkResponse {
  provider_slug: string;
  provider_id: string;
  provider_name: string;
  link_name: string;
  service_ids: string[];
  staff_ids: string[];
  location_id?: string | null;
  location_type?: string | null;
  prefill?: ExpressPrefill;
}

type DevicePlatform = "ios" | "android" | "other";

function detectPlatform(): DevicePlatform {
  if (typeof navigator === "undefined") return "other";
  const osType = getOsTypeFromNavigator(navigator);
  if (osType === "ios") return "ios";
  if (osType === "android" || osType === "huawei") return "android";
  return "other";
}

const IOS_APP_URL = "https://apps.apple.com/app/beautonomi";
const ANDROID_APP_URL = "https://play.google.com/store/apps/details?id=com.beautonomi";

function AppDownloadBanner({
  providerName,
  platform,
  onDismiss,
}: {
  providerName: string;
  platform: "ios" | "android";
  onDismiss: () => void;
}) {
  const storeUrl = platform === "ios" ? IOS_APP_URL : ANDROID_APP_URL;
  const storeLabel = platform === "ios" ? "App Store" : "Google Play";
  const storeIcon = platform === "ios" ? "🍎" : "🤖";

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 safe-area-inset-bottom"
      style={{
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.1)",
      }}
    >
      <div className="max-w-[430px] mx-auto">
        <div className="flex items-center gap-3">
          {/* App icon placeholder */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
            style={{ backgroundColor: "#FF0077", color: "#fff" }}
            aria-hidden
          >
            ✦
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900 truncate">
              Book {providerName} seamlessly
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">
              Download the Beautonomi app for instant bookings, notifications &amp; easy rescheduling.
            </p>
          </div>

          {/* Dismiss */}
          <button
            onClick={onDismiss}
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>

        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 w-full rounded-2xl py-3 font-semibold text-white text-sm transition-transform active:scale-[0.97]"
          style={{ backgroundColor: "#FF0077" }}
        >
          <span>{storeIcon}</span>
          <span>Get the app on {storeLabel}</span>
        </a>
      </div>
    </div>
  );
}

const DISMISS_KEY = "beautonomi_app_banner_dismissed";

export default function ExpressBookLinkPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const linkSlug = params?.linkSlug as string;
  const [error, setError] = useState<string | null>(null);
  const [providerName, setProviderName] = useState("");
  const [platform, setPlatform] = useState<DevicePlatform>("other");
  const [bannerDismissed, setBannerDismissed] = useState(true); // start hidden, show after hydration

  /* Hydrate banner visibility — avoids SSR mismatch */
  useEffect(() => {
    const detected = detectPlatform();
    setPlatform(detected);
    if (detected !== "other") {
      try {
        const dismissed = sessionStorage.getItem(DISMISS_KEY);
        setBannerDismissed(dismissed === "1");
      } catch {
        setBannerDismissed(false);
      }
    }
  }, []);

  const handleDismiss = () => {
    setBannerDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
  };

  useEffect(() => {
    if (!linkSlug) return;
    // Wait for auth to resolve so we can pick the right destination
    // (logged-in customer → `/booking?slug=…`, guest/embed → `/book/[slug]?…`).
    if (authLoading) return;
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

        if (data.provider_name) setProviderName(data.provider_name);

        const isEmbed = searchParams?.get("embed") === "1";

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
        if (isEmbed) q.set("embed", "1");
        const refParam = searchParams?.get("ref")?.trim();
        if (refParam) q.set("ref", refParam);

        const pf = data.prefill;
        if (pf?.addon_ids?.length) q.set("addons", pf.addon_ids.join(","));
        if (pf?.promotion_code?.trim()) q.set("promo", pf.promotion_code.trim());
        if (pf?.gift_card_code?.trim()) q.set("gift_card", pf.gift_card_code.trim());
        if (pf?.product_cart?.length) q.set("products", productCartToQueryParam(pf.product_cart));

        // Logged-in customers (non-embed) get the richer `/booking` flow:
        // auto-hydrated profile, saved addresses, saved cards, loyalty + saved
        // gift cards, recurring subscribe. Guests and embeds stay on the express
        // `/book/[slug]` surface for deep-link prefill parity.
        if (user && !isEmbed) {
          q.set("slug", data.provider_slug);
          const query = q.toString();
          router.replace(`/booking${query ? `?${query}` : ""}`);
        } else {
          const query = q.toString();
          router.replace(`/book/${encodeURIComponent(data.provider_slug)}${query ? `?${query}` : ""}`);
        }
      } catch (err) {
        const message =
          err instanceof FetchError
            ? (err.status === 404 ? "Booking link not found or expired" : err.message)
            : "Failed to load booking link";
        setError(message);
      }
    };
    resolve();
  }, [linkSlug, router, searchParams, user, authLoading]);

  const showBanner = platform !== "other" && !bannerDismissed;

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
        {showBanner && (
          <AppDownloadBanner
            providerName={providerName || "your provider"}
            platform={platform as "ios" | "android"}
            onDismiss={handleDismiss}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 p-6"
      style={{ paddingBottom: showBanner ? "160px" : undefined }}
    >
      <LoadingTimeout loadingMessage="Opening booking..." />

      {/* Beautonomi branding during load */}
      <div className="text-center space-y-1 mt-2">
        <p className="text-xs text-gray-400">
          Powered by Beautonomi
        </p>
      </div>

      {showBanner && (
        <AppDownloadBanner
          providerName={providerName || "your provider"}
          platform={platform as "ios" | "android"}
          onDismiss={handleDismiss}
        />
      )}
    </div>
  );
}
