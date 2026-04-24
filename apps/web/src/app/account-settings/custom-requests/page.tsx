import CustomRequestsPageClient from "./CustomRequestsPageClient";
import { fetchCustomRequestsPageInitial } from "./fetch-custom-requests-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await fetchCustomRequestsPageInitial();
  return <CustomRequestsPageClient initial={initial} />;
}
