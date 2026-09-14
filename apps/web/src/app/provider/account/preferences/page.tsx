import PreferencesPageClient from "@/app/account-settings/preferences/PreferencesPageClient";
import { fetchPreferencesInitial } from "@/app/account-settings/preferences/fetch-preferences-initial";
import { getServerT } from "@/lib/i18n/server";
import { resolveRequestLanguage } from "@/lib/locale/resolve-request-language";

export const dynamic = "force-dynamic";

export default async function Page() {
  const localeCtx = await resolveRequestLanguage();
  const t = await getServerT(localeCtx.language);
  const initial = await fetchPreferencesInitial();
  return (
    <PreferencesPageClient
      initial={initial}
      accountHomeHref="/provider/settings"
      accountHomeLabel={t("web.layout.providerNav.settingsDesc")}
      showBottomNav={false}
    />
  );
}
