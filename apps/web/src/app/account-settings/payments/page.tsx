import PaymentsPageClient from "./PaymentsPageClient";
import { fetchPaymentsPageInitial } from "./fetch-payments-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await fetchPaymentsPageInitial();
  return <PaymentsPageClient initial={initial} />;
}
