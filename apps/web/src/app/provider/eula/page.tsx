import TermsClient from "@/app/terms-and-condition/terms-client";
import {
  PARTNER_EULA_DEFAULT_SECTIONS,
  PARTNER_EULA_LAST_UPDATED,
} from "@/lib/legal/app-eula-defaults";
import { buildEulaPageData } from "@/lib/legal/build-eula-page-data";

export const revalidate = 300;

export default async function PartnerEulaPage() {
  const data = await buildEulaPageData({
    cmsSlug: "provider-eula",
    defaultPageTitle: "Beautonomi Partner — End User License Agreement",
    defaultIntroHtml: `<p>These End User License Agreement terms govern your use of the <strong>Beautonomi Partner</strong> mobile application and related provider services. By creating an account, signing in, or using the app, you agree to this EULA and our Privacy Policy.</p><p>Last updated: ${PARTNER_EULA_LAST_UPDATED}.</p>`,
    defaultSections: PARTNER_EULA_DEFAULT_SECTIONS,
    lastUpdated: PARTNER_EULA_LAST_UPDATED,
    breadcrumbLabel: "Partner EULA",
  });

  return <TermsClient data={data} />;
}
