import ReferralsPageClient from "./ReferralsPageClient";
import { fetchReferralsInitial } from "./fetch-referrals-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await fetchReferralsInitial();
  return <ReferralsPageClient initial={initial} />;
}
