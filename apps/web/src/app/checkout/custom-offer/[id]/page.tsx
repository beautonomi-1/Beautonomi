import CustomOfferCheckoutPageClient from "./CustomOfferCheckoutPageClient";

export default async function CustomOfferCheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomOfferCheckoutPageClient offerId={id} />;
}
