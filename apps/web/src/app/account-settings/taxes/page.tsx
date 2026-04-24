import TaxesPageClient from "./TaxesPageClient";
import { fetchTaxesInitial } from "./fetch-taxes-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await fetchTaxesInitial();
  return <TaxesPageClient initial={initial} />;
}
