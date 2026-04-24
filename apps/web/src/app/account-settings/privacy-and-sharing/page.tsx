import PrivacyAndSharingPageClient from "./PrivacyAndSharingPageClient";
import { fetchPrivacyPageInitial } from "./fetch-privacy-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await fetchPrivacyPageInitial();
  return <PrivacyAndSharingPageClient initial={initial} />;
}
