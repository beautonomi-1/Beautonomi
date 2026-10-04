import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getPublicHoldRedirectInfo } from "@/lib/booking/get-public-hold";
import { bookContinueRedirectPath } from "@/lib/booking/legacy-book-redirects";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { isBookingEmbedQueryParam } from "@beautonomi/utils";

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  searchParams: Promise<SearchParams>;
}

/**
 * Legacy `/book/continue?hold_id=…` → unified checkout on `/booking?slug=…&hold_id=…&step=pay`.
 */
export default async function BookContinueRedirectPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const holdId = readParam(sp, "hold_id");
  const embed = isBookingEmbedQueryParam(readParam(sp, "embed"));

  if (!holdId?.trim()) {
    redirect("/account-settings/bookings");
  }

  const headerList = await headers();
  const req = new Request("https://placeholder.local/book/continue", {
    headers: headerList,
  });

  let tenantId: string;
  try {
    tenantId = await resolveTenantIdWithZaFallback(req);
  } catch {
    notFound();
  }

  const info = await getPublicHoldRedirectInfo(holdId.trim(), tenantId);
  if (!info) {
    redirect("/account-settings/bookings");
  }

  redirect(
    bookContinueRedirectPath({
      holdId: holdId.trim(),
      providerSlug: info.providerSlug,
      embed,
      sp,
    }),
  );
}

function readParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  if (Array.isArray(v)) return v.find((x) => typeof x === "string" && x.length > 0);
  return typeof v === "string" ? v : undefined;
}
