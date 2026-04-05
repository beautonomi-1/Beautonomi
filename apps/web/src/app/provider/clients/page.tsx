import { ClientsClient } from "./ClientsClient";
import { fetchClientsInitial } from "./fetch-clients-initial";

export const dynamic = "force-dynamic";

export default async function ProviderClientsPage() {
  const { clients, error } = await fetchClientsInitial();
  return (
    <ClientsClient initialClients={clients} initialError={error} fromServer />
  );
}
