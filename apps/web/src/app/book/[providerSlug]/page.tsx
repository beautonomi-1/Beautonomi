import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import BookProviderClient from "./book-provider-client";

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  params: Promise<{ providerSlug: string }>;
  searchParams: Promise<SearchParams>;
}

/**
 * `/book/[providerSlug]` is retained ONLY for:
 *  - Embedded express booking (`?embed=1`)
 *  - Multi-service deep links (`?services=id1,id2,...`)
 *
 * All other visits are 308 redirected to the canonical `/booking?slug=...`.
 * F23 (audit): one canonical booking URL.
 */
export default async function BookProviderPage({ params, searchParams }: PageProps) {
  const { providerSlug } = await params;
  const sp = (await searchParams) ?? {};

  const embed = pick(sp, "embed") === "1";
  const services = (pick(sp, "services") ?? "").split(",").filter(Boolean);
  const multiServiceDeepLink = services.length > 1;

  if (!embed && !multiServiceDeepLink) {
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

function pick(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  if (Array.isArray(v)) return v[0];
  return v;
}
