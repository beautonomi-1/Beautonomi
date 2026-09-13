import TermsClient from "@/app/terms-and-condition/terms-client";
import { getServerT } from "@/lib/i18n/server";
import { resolveRequestLanguage } from "@/lib/locale/resolve-request-language";
import {
  PARTNER_EULA_DEFAULT_SECTIONS,
  PARTNER_EULA_LAST_UPDATED,
} from "@/lib/legal/app-eula-defaults";
import { buildEulaPageData } from "@/lib/legal/build-eula-page-data";

export const revalidate = 300;

export default async function PartnerEulaPage() {
  const localeCtx = await resolveRequestLanguage();
  const t = await getServerT(localeCtx.language);
  const data = await buildEulaPageData({
    cmsSlug: "provider-eula",
    defaultPageTitle: t("web.provider.pages.eula.title"),
    defaultIntroHtml: `<p>${t("web.provider.pages.eula.intro")}</p><p>${t("web.provider.pages.eula.lastUpdated", { date: PARTNER_EULA_LAST_UPDATED })}</p>`,
    defaultSections: PARTNER_EULA_DEFAULT_SECTIONS,
    lastUpdated: PARTNER_EULA_LAST_UPDATED,
    breadcrumbLabel: t("web.provider.pages.eula.breadcrumb"),
  });

  return <TermsClient data={data} />;
}
