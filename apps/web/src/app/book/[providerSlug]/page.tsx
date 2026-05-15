import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { bookingUrlNeedsOnlineBookingFlowNew } from "@/lib/booking/booking-url-needs-new-flow";
import BookProviderClient from "./book-provider-client";

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  params: Promise<{ providerSlug: string }>;
  searchParams: Promise<SearchParams>;
}

/**
 * `/book/[providerSlug]` serves `OnlineBookingFlowNew` for any **meaningful** deep link
 * (single/multi service, express-link venue/staff, checkout prefill, package, embed, etc.).
 *
 * Bare `/book/[slug]` (no query) still 308s to the canonical legacy flow `/booking?slug=…`
 * (F23). Sending express / marketing deep links here avoids losing `location_type`, addons,
 * promo, gift card, and product cart prefill, which the `/booking` stack does not apply.
 */
export default async function BookProviderPage({ params, searchParams }: PageProps) {
  const { providerSlug } = await params;
  const sp = (await searchParams) ?? {};
  const keepOnNewBookingFlow = bookingUrlNeedsOnlineBookingFlowNew(searchParamsToURLSearchParams(sp));

  if (!keepOnNewBookingFlow) {
    const target = new URLSearchParams();
    target.set("slug", providerSlug);
    for (const [k, v] of Object.entries(sp)) {
      if (k === "slug") continue;
      if (Array.isArray(v)) {
        for (const item of v) if (item) target.append(k, item);
      } else if (v != null) {
        target.set(k, v);
      }
    }
    permanentRedirect(`/booking?${target.toString()}`);
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <LoadingTimeout loadingMessage="Loading..." />
        </div>
      }
    >
      <BookProviderClient providerSlug={providerSlug} />
    </Suspense>
  );
}

function searchParamsToURLSearchParams(sp: SearchParams): URLSearchParams {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item) u.append(k, item);
      }
    } else if (v != null && v !== "") {
      u.set(k, v);
    }
  }
  return u;
}
