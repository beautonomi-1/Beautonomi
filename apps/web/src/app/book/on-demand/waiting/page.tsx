import { permanentRedirect } from "next/navigation";
import { bookOnDemandRedirectPath } from "@/lib/booking/legacy-book-redirects";

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function LegacyOnDemandWaitingRedirect({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  permanentRedirect(bookOnDemandRedirectPath("waiting", sp));
}
