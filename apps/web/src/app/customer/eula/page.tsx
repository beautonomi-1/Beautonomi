import TermsClient from "@/app/terms-and-condition/terms-client";
import {
  CUSTOMER_EULA_DEFAULT_SECTIONS,
  CUSTOMER_EULA_LAST_UPDATED,
} from "@/lib/legal/app-eula-defaults";
import { buildEulaPageData } from "@/lib/legal/build-eula-page-data";

export const revalidate = 300;

export default async function CustomerEulaPage() {
  const data = await buildEulaPageData({
    cmsSlug: "customer-eula",
    defaultPageTitle: "Beautonomi — End User License Agreement",
    defaultIntroHtml: `<p>These End User License Agreement terms govern your use of the <strong>Beautonomi</strong> customer app and marketplace. By creating an account, signing in, or using the app, you agree to this EULA and our Privacy Policy.</p><p>Last updated: ${CUSTOMER_EULA_LAST_UPDATED}.</p>`,
    defaultSections: CUSTOMER_EULA_DEFAULT_SECTIONS,
    lastUpdated: CUSTOMER_EULA_LAST_UPDATED,
    breadcrumbLabel: "End User License Agreement",
  });

  return <TermsClient data={data} />;
}
