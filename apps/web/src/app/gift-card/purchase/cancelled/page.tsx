"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { XCircle, Loader2 } from "lucide-react";
import Navbar4 from "@/components/global/Navbar4";
import { Button } from "@/components/ui/button";

/**
 * Cancelled checkout landing page for gift card purchases.
 *
 * The web purchase API at `apps/web/src/app/api/public/gift-cards/purchase/route.ts`
 * sets Paystack's `cancel_action` to `${APP_URL}/gift-card/purchase/cancelled`
 * for browser checkouts. Without a real page this URL 404'd, leaving buyers on
 * a broken state after backing out of payment. This page acknowledges the
 * cancellation, preserves the order reference for support, and lets users
 * retry the purchase or head back to gift cards.
 */
function GiftCardPurchaseCancelledInner() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference")?.trim() || searchParams.get("trxref")?.trim() || "";
  const [retryUrl, setRetryUrl] = useState<string>("/gift-card/purchase");

  const supportSubject = useMemo(
    () => (reference ? `Gift card checkout cancelled (${reference})` : "Gift card checkout cancelled"),
    [reference],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    sp.delete("reference");
    sp.delete("trxref");
    const qs = sp.toString();
    setRetryUrl(`/gift-card/purchase${qs ? `?${qs}` : ""}`);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar4 />
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <XCircle className="mx-auto mb-3 h-12 w-12 text-amber-600" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-gray-900">Purchase cancelled</h1>
          <p className="mt-2 text-gray-700">
            Your gift card payment was cancelled before it was completed. No card was issued and your bank was not
            charged.
          </p>
          {reference ? (
            <p className="mt-3 text-xs text-gray-500">
              Reference: <span className="font-mono">{reference}</span>
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link href={retryUrl}>Try again</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/gift-card">Back to gift cards</Link>
          </Button>
          <p className="mt-2 text-center text-sm text-gray-500">
            Need help? <Link href={`mailto:support@beautonomi.co.za?subject=${encodeURIComponent(supportSubject)}`} className="font-medium text-primary underline">Contact support</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GiftCardPurchaseCancelledPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
        </div>
      }
    >
      <GiftCardPurchaseCancelledInner />
    </Suspense>
  );
}
