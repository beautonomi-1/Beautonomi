import LoginAndSecurityPageClient from "@/app/account-settings/login-and-security/LoginAndSecurityPageClient";
import { fetchLoginAndSecurityInitial } from "@/app/account-settings/login-and-security/fetch-login-and-security-initial";
import { getServerT } from "@/lib/i18n/server";
import { resolveRequestLanguage } from "@/lib/locale/resolve-request-language";

export const dynamic = "force-dynamic";

export default async function Page() {
  const localeCtx = await resolveRequestLanguage();
  const t = await getServerT(localeCtx.language);
  const initial = await fetchLoginAndSecurityInitial();
  return (
    <LoginAndSecurityPageClient
      initial={initial}
      accountHomeHref="/provider/settings"
      accountHomeLabel={t("web.layout.providerNav.settingsDesc")}
    />
  );
}
