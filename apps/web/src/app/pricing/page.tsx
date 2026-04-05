import PricingPageClient from "./pricing-page-client";
import { getPricingPageData } from "./pricing-data";

export const revalidate = 300;

export default async function PricingPage() {
  const { plans, faqs, pageContent } = await getPricingPageData();
  return (
    <PricingPageClient
      pricingPlans={plans}
      faqs={faqs}
      pageContent={pageContent}
    />
  );
}
