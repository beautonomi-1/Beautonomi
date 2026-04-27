import PrivacyAndSharingPageClient from "@/app/account-settings/privacy-and-sharing/PrivacyAndSharingPageClient";
import { fetchPrivacyPageInitial } from "@/app/account-settings/privacy-and-sharing/fetch-privacy-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await fetchPrivacyPageInitial();
  return (
    <PrivacyAndSharingPageClient
      initial={initial}
      accountHomeHref="/provider/settings"
      accountHomeLabel="Provider settings"
      loginSecurityHref="/provider/account/login-and-security"
    />
  );
}
