import { permanentRedirect, redirect } from "next/navigation";
import { Suspense } from "react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { bookingUrlNeedsOnlineBookingFlowNew } from "@/lib/booking/booking-url-needs-new-flow";
import { getSupabaseServer } from "@/lib/supabase/server";
import BookProviderClient from "./book-provider-client";

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  params: Promise<{ providerSlug: string }>;
  searchParams: Promise<SearchParams>;
}

/**
 * `/book/[providerSlug]` is the **express** booking surface (`OnlineBookingFlowNew`).
 *
 * Routing rules:
 * 1) `embed=1` → ALWAYS stay on express (iframe / provider site embeds rely on this
 *    deep-link parity for venue, addons, promo, gift card, product cart).
 * 2) **Logged-in customers without `embed=1`** → 307 to `/booking?slug=…&…` so they
 *    get the richer `BookingFlow` (auto-hydrated client info, saved addresses, saved
 *    cards, loyalty / saved gift cards, recurring subscribe). The express flow is
 *    optimised for guests / anonymous shortlinks and does not surface those affordances.
 * 3) Bare `/book/[slug]` with no meaningful deep link → 308 to `/booking?slug=…` (legacy
 *    canonical path).
 * 4) Otherwise (guest + deep link) → render express (`OnlineBookingFlowNew`).
 */
export default async function BookProviderPage({ params, searchParams }: PageProps) {
  const { providerSlug } = await params;
  const sp = (await searchParams) ?? {};
  const embed = readParam(sp, "embed") === "1";
  const authReturn = (readParam(sp, "auth_return") ?? "").trim();
  // `express=1` keeps a logged-in customer on the express surface (set by the
  // /book/l/[slug] resolver for custom links carrying rich prefill that the
  // legacy /booking flow drops, e.g. staff, venue, multi-service, promo, gift
  // card, addons, product cart). Without this they would be bounced to /booking
  // and lose those selections.
  const forceExpress = readParam(sp, "express") === "1";
  const keepOnNewBookingFlow =
    forceExpress || bookingUrlNeedsOnlineBookingFlowNew(searchParamsToURLSearchParams(sp));

  // (3) Bare /book/[slug] (no deep-link params) → permanent redirect to /booking?slug=…
  if (!keepOnNewBookingFlow) {
    permanentRedirect(`/booking?${buildBookingTarget(providerSlug, sp).toString()}`);
  }

  // (2) Logged-in customers (non-embed, non-OAuth-return) → temporary redirect to /booking?slug=…&…
  //
  // We probe `auth.getUser()` server-side so there's no client flash of the express UI
  // before the bounce. `embed=1` skips this so iframe deep links keep working. `auth_return`
  // skips it so the express OAuth round-trip can finish bridging session storage before any
  // re-routing happens (BeautonomiGateModal / preAuthGateOpen flow). `express=1` skips it so
  // rich custom-link prefill survives for signed-in customers.
  if (!embed && !authReturn && !forceExpress) {
    try {
      const supabase = await getSupabaseServer();
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        redirect(`/booking?${buildBookingTarget(providerSlug, sp).toString()}`);
      }
    } catch {
      // Auth probe failures must not break the guest flow — fall through to express.
    }
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

function readParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  if (Array.isArray(v)) return v.find((x) => typeof x === "string" && x.length > 0);
  return typeof v === "string" ? v : undefined;
}

function buildBookingTarget(providerSlug: string, sp: SearchParams): URLSearchParams {
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
  return target;
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
