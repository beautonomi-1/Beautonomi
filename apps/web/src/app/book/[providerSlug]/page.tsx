import { permanentRedirect } from "next/navigation";
import { bookSlugRedirectPath } from "@/lib/booking/legacy-book-redirects";

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  params: Promise<{ providerSlug: string }>;
  searchParams: Promise<SearchParams>;
}

/** Legacy express path — permanently redirect to canonical `/booking?slug=…`. */
export default async function BookProviderPage({ params, searchParams }: PageProps) {
  const { providerSlug } = await params;
  const sp = (await searchParams) ?? {};
  permanentRedirect(bookSlugRedirectPath(providerSlug, sp));
}
