import PricingPageClient from "./pricing-page-client";
import { getPricingPageData } from "./pricing-data";

/** Tenant resolution uses `headers()` — cannot be statically generated alongside `revalidate`. */
export const dynamic = "force-dynamic";

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
