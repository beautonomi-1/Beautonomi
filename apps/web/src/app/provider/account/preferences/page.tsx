import PreferencesPageClient from "@/app/account-settings/preferences/PreferencesPageClient";
import { fetchPreferencesInitial } from "@/app/account-settings/preferences/fetch-preferences-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await fetchPreferencesInitial();
  return (
    <PreferencesPageClient
      initial={initial}
      accountHomeHref="/provider/settings"
      accountHomeLabel="Provider settings"
      showBottomNav={false}
    />
  );
}
