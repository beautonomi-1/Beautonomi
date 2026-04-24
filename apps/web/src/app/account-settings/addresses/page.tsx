import AddressesPageClient from "./AddressesPageClient";
import { fetchAddressesInitial } from "./fetch-addresses-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialAddresses = await fetchAddressesInitial();
  return <AddressesPageClient initialAddresses={initialAddresses} />;
}
